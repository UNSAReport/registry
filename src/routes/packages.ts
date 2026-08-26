import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { config } from '@/config';
import { db } from '@/db';
import {
  packageDependencies,
  packageFiles,
  packages,
  packageTags,
  packageVersions,
  tags,
  trustedUsers,
} from '@/db/schema';
import { checkCircularDependencies } from '@/lib/dependency-resolver';
import { validateManifest } from '@/lib/manifest';
import {
  buildAndUploadZipArchive,
  deleteS3Object,
  uploadS3Object,
} from '@/lib/s3';
import { optionalAuth, requireAuth } from '@/middleware/auth';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from '@/middleware/error-handler';
import type { HonoEnv } from '@/types';

const packagesRouter = new Hono<HonoEnv>();

// GET /v1/packages - Search / list packages
packagesRouter.get('/', optionalAuth, async (c) => {
  const q = c.req.query('q')?.trim();
  const tagFilter = c.req.query('tag')?.trim();
  const statusFilter = c.req.query('status')?.trim() || 'approved';
  const limit = Math.min(
    Number.parseInt(c.req.query('limit') || '20', 10),
    100,
  );
  const offset = Math.max(Number.parseInt(c.req.query('offset') || '0', 10), 0);

  const user = c.get('user');
  const isAdmin = user?.roles.includes('admin');

  const conditions = [];

  // Status filtering: non-admins can only see approved packages unless viewing their own
  if (statusFilter === 'approved') {
    conditions.push(eq(packages.status, 'approved'));
  } else if (!isAdmin) {
    if (user) {
      conditions.push(
        and(eq(packages.status, statusFilter), eq(packages.authorId, user.id)),
      );
    } else {
      conditions.push(eq(packages.status, 'approved'));
    }
  } else {
    conditions.push(eq(packages.status, statusFilter));
  }

  // Search query (full text search on name and description)
  if (q) {
    conditions.push(
      sql`(
        to_tsvector('english', coalesce(${packages.name}, '') || ' ' || coalesce(${packages.displayName}, '') || ' ' || coalesce(${packages.description}, ''))
        @@ websearch_to_tsquery('english', ${q})
        OR ${packages.name} ILIKE ${`%${q}%`}
      )`,
    );
  }

  // Tag filter
  if (tagFilter) {
    const matchingTag = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, tagFilter.toLowerCase()))
      .limit(1);

    if (matchingTag.length > 0) {
      const pkgIdsWithTag = await db
        .select({ packageId: packageTags.packageId })
        .from(packageTags)
        .where(eq(packageTags.tagId, matchingTag[0].id));

      const ids = pkgIdsWithTag.map((pt) => pt.packageId);
      if (ids.length === 0) {
        return c.json({ total: 0, packages: [] });
      }
      conditions.push(inArray(packages.id, ids));
    } else {
      return c.json({ total: 0, packages: [] });
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select()
    .from(packages)
    .where(whereClause)
    .orderBy(desc(packages.updatedAt))
    .limit(limit)
    .offset(offset);

  // Enhance each package with tags
  const packageList = await Promise.all(
    results.map(async (pkg) => {
      const tagRows = await db
        .select({ name: tags.name, displayName: tags.displayName })
        .from(packageTags)
        .innerJoin(tags, eq(packageTags.tagId, tags.id))
        .where(eq(packageTags.packageId, pkg.id));

      return {
        ...pkg,
        tags: tagRows.map((t) => t.name),
      };
    }),
  );

  return c.json({
    total: packageList.length,
    offset,
    limit,
    packages: packageList,
  });
});

// GET /v1/packages/:name - Get package metadata
packagesRouter.get('/:name', async (c) => {
  const name = c.req.param('name').toLowerCase();

  const pkgList = await db
    .select()
    .from(packages)
    .where(eq(packages.name, name))
    .limit(1);

  if (pkgList.length === 0) {
    throw new NotFoundError(`Package '${name}' not found`);
  }

  const pkg = pkgList[0];

  const tagRows = await db
    .select({ name: tags.name, displayName: tags.displayName })
    .from(packageTags)
    .innerJoin(tags, eq(packageTags.tagId, tags.id))
    .where(eq(packageTags.packageId, pkg.id));

  const versionRows = await db
    .select({
      version: packageVersions.version,
      status: packageVersions.status,
      createdAt: packageVersions.createdAt,
    })
    .from(packageVersions)
    .where(eq(packageVersions.packageId, pkg.id))
    .orderBy(desc(packageVersions.createdAt));

  return c.json({
    ...pkg,
    tags: tagRows.map((t) => t.name),
    versions: versionRows.map((v) => v.version),
  });
});

// GET /v1/packages/:name/versions - List all versions
packagesRouter.get('/:name/versions', async (c) => {
  const name = c.req.param('name').toLowerCase();

  const pkgList = await db
    .select({ id: packages.id })
    .from(packages)
    .where(eq(packages.name, name))
    .limit(1);

  if (pkgList.length === 0) {
    throw new NotFoundError(`Package '${name}' not found`);
  }

  const versionRows = await db
    .select({
      id: packageVersions.id,
      version: packageVersions.version,
      entry: packageVersions.entry,
      status: packageVersions.status,
      fileCount: packageVersions.fileCount,
      createdAt: packageVersions.createdAt,
      approvedAt: packageVersions.approvedAt,
    })
    .from(packageVersions)
    .where(eq(packageVersions.packageId, pkgList[0].id))
    .orderBy(desc(packageVersions.createdAt));

  return c.json({
    package: name,
    versions: versionRows,
  });
});

// GET /v1/packages/:name/:version - Get specific version metadata
packagesRouter.get('/:name/:version', async (c) => {
  const name = c.req.param('name').toLowerCase();
  const version = c.req.param('version');

  const pkgList = await db
    .select()
    .from(packages)
    .where(eq(packages.name, name))
    .limit(1);

  if (pkgList.length === 0) {
    throw new NotFoundError(`Package '${name}' not found`);
  }

  const verList = await db
    .select()
    .from(packageVersions)
    .where(
      and(
        eq(packageVersions.packageId, pkgList[0].id),
        eq(packageVersions.version, version),
      ),
    )
    .limit(1);

  if (verList.length === 0) {
    throw new NotFoundError(
      `Version '${version}' not found for package '${name}'`,
    );
  }

  const ver = verList[0];

  const filesRows = await db
    .select({
      path: packageFiles.path,
      size: packageFiles.size,
      checksum: packageFiles.checksum,
    })
    .from(packageFiles)
    .where(eq(packageFiles.versionId, ver.id));

  const depsRows = await db
    .select({
      dependencyName: packageDependencies.dependencyName,
      versionRange: packageDependencies.versionRange,
    })
    .from(packageDependencies)
    .where(eq(packageDependencies.versionId, ver.id));

  const dependenciesObject: Record<string, string> = {};
  for (const dep of depsRows) {
    dependenciesObject[dep.dependencyName] = dep.versionRange;
  }

  return c.json({
    package: name,
    displayName: pkgList[0].displayName,
    description: pkgList[0].description,
    authorId: pkgList[0].authorId,
    version: ver.version,
    entry: ver.entry,
    status: ver.status,
    rejectionReason: ver.rejectionReason,
    fileCount: ver.fileCount,
    createdAt: ver.createdAt,
    approvedAt: ver.approvedAt,
    files: filesRows,
    dependencies: dependenciesObject,
  });
});

// POST /v1/packages - Upload new package
packagesRouter.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user) {
    throw new UnauthorizedError();
  }

  const formData = await c.req.parseBody({ all: true });

  if (!formData.manifest) {
    throw new ValidationError('Missing "manifest" field in multipart body', {
      field: 'manifest',
    });
  }

  let rawManifest: unknown;
  try {
    rawManifest =
      typeof formData.manifest === 'string'
        ? JSON.parse(formData.manifest)
        : formData.manifest;
  } catch {
    throw new ValidationError('Invalid JSON in "manifest" field', {
      field: 'manifest',
    });
  }

  // Extract file uploads from form data
  const fileEntries: { path: string; buffer: Buffer; content: Buffer }[] = [];
  const uploadedFilePaths: string[] = [];

  for (const [key, value] of Object.entries(formData)) {
    if (key === 'manifest') continue;

    // Normalize path (handle files attached with key or file.name)
    if (value instanceof File) {
      const arrayBuffer = await value.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const path = (value.name || key).replace(/^[/\\]+/, '');
      fileEntries.push({ path, buffer, content: buffer });
      uploadedFilePaths.push(path);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item instanceof File) {
          const arrayBuffer = await item.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const path = (item.name || key).replace(/^[/\\]+/, '');
          fileEntries.push({ path, buffer, content: buffer });
          uploadedFilePaths.push(path);
        }
      }
    }
  }

  const manifest = validateManifest(rawManifest, uploadedFilePaths);

  // Check package ownership if package exists
  const existingPkg = await db
    .select()
    .from(packages)
    .where(eq(packages.name, manifest.name))
    .limit(1);

  let packageId: string;

  if (existingPkg.length > 0) {
    if (existingPkg[0].authorId !== user.id && !user.roles.includes('admin')) {
      throw new ForbiddenError(
        `Package '${manifest.name}' is owned by another user`,
      );
    }
    packageId = existingPkg[0].id;

    // Check version uniqueness
    const existingVer = await db
      .select({ id: packageVersions.id })
      .from(packageVersions)
      .where(
        and(
          eq(packageVersions.packageId, packageId),
          eq(packageVersions.version, manifest.version),
        ),
      )
      .limit(1);

    if (existingVer.length > 0) {
      throw new ConflictError(
        `Version '${manifest.version}' already exists for package '${manifest.name}'`,
      );
    }
  } else {
    packageId = crypto.randomUUID();
  }

  // Validate declared dependencies exist in registry
  if (manifest.dependencies) {
    for (const depName of Object.keys(manifest.dependencies)) {
      const depPkg = await db
        .select({ id: packages.id })
        .from(packages)
        .where(eq(packages.name, depName))
        .limit(1);

      if (depPkg.length === 0) {
        throw new ValidationError(
          `Declared dependency '${depName}' does not exist in registry`,
          { field: `dependencies.${depName}` },
        );
      }
    }

    // Check circular dependencies
    await checkCircularDependencies(manifest.name, manifest.dependencies);
  }

  // Validate tags if provided
  const resolvedTagIds: string[] = [];
  if (manifest.tags) {
    for (const tagName of manifest.tags) {
      const tagRow = await db
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.name, tagName))
        .limit(1);

      if (tagRow.length === 0) {
        throw new ValidationError(`Tag '${tagName}' does not exist`, {
          field: 'tags',
        });
      }
      resolvedTagIds.push(tagRow[0].id);
    }
  }

  // Determine approval status
  const isAdmin = user.roles.includes('admin');
  const isTrusted = await db
    .select({ userId: trustedUsers.userId })
    .from(trustedUsers)
    .where(eq(trustedUsers.userId, user.id))
    .limit(1);

  const isApproved = isAdmin || isTrusted.length > 0;
  const initialStatus = isApproved ? 'approved' : 'pending';

  // If pending, check max pending packages limit
  if (initialStatus === 'pending') {
    const userPendingVersions = await db
      .select({ id: packageVersions.id })
      .from(packageVersions)
      .innerJoin(packages, eq(packageVersions.packageId, packages.id))
      .where(
        and(
          eq(packages.authorId, user.id),
          eq(packageVersions.status, 'pending'),
        ),
      );

    if (userPendingVersions.length >= config.maxPendingPackages) {
      throw new RateLimitError(
        `Pending packages limit reached (max: ${config.maxPendingPackages}). Please wait for admin approval.`,
      );
    }
  }

  const versionId = crypto.randomUUID();
  const s3Prefix = `packages/${packageId}/${manifest.version}/`;
  const archiveS3Key = `${s3Prefix}archive.zip`;

  // Upload individual files to S3
  const fileRecords: {
    id: string;
    versionId: string;
    path: string;
    size: number;
    checksum: string;
    s3Key: string;
  }[] = [];

  for (const file of fileEntries) {
    const fileS3Key = `${s3Prefix}${file.path}`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    await uploadS3Object(fileS3Key, file.buffer);

    fileRecords.push({
      id: crypto.randomUUID(),
      versionId,
      path: file.path,
      size: file.buffer.length,
      checksum,
      s3Key: fileS3Key,
    });
  }

  // Upload zip archive
  await buildAndUploadZipArchive(archiveS3Key, fileEntries);

  // Insert or update package in DB
  const now = new Date();
  if (existingPkg.length === 0) {
    await db.insert(packages).values({
      id: packageId,
      name: manifest.name,
      displayName: manifest.displayName || manifest.name,
      description: manifest.description,
      authorId: user.id,
      latestVersion: initialStatus === 'approved' ? manifest.version : null,
      status: initialStatus,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(packages)
      .set({
        displayName: manifest.displayName || existingPkg[0].displayName,
        description: manifest.description || existingPkg[0].description,
        latestVersion:
          initialStatus === 'approved'
            ? manifest.version
            : existingPkg[0].latestVersion,
        updatedAt: now,
      })
      .where(eq(packages.id, packageId));
  }

  // Insert package version
  await db.insert(packageVersions).values({
    id: versionId,
    packageId,
    version: manifest.version,
    entry: manifest.entry || null,
    status: initialStatus,
    s3Key: s3Prefix,
    archiveS3Key,
    fileCount: fileRecords.length,
    createdAt: now,
    approvedAt: initialStatus === 'approved' ? now : null,
  });

  // Insert package files
  if (fileRecords.length > 0) {
    await db.insert(packageFiles).values(fileRecords);
  }

  // Insert package dependencies
  if (manifest.dependencies) {
    const depRecords = Object.entries(manifest.dependencies).map(
      ([depName, range]) => ({
        id: crypto.randomUUID(),
        versionId,
        dependencyName: depName,
        versionRange: range,
      }),
    );
    if (depRecords.length > 0) {
      await db.insert(packageDependencies).values(depRecords);
    }
  }

  // Link tags
  if (resolvedTagIds.length > 0) {
    for (const tagId of resolvedTagIds) {
      await db
        .insert(packageTags)
        .values({ packageId, tagId })
        .onConflictDoNothing();
    }
  }

  return c.json(
    {
      message: 'Package version uploaded successfully',
      package: manifest.name,
      version: manifest.version,
      status: initialStatus,
      approved: isApproved,
    },
    201,
  );
});

// PUT /v1/packages/:name/:version - Update pending version
packagesRouter.put('/:name/:version', requireAuth, async (c) => {
  const name = c.req.param('name').toLowerCase();
  const version = c.req.param('version');
  const user = c.get('user');
  if (!user) {
    throw new UnauthorizedError();
  }

  const pkgList = await db
    .select()
    .from(packages)
    .where(eq(packages.name, name))
    .limit(1);

  if (pkgList.length === 0) {
    throw new NotFoundError(`Package '${name}' not found`);
  }

  const pkg = pkgList[0];

  if (pkg.authorId !== user.id && !user.roles.includes('admin')) {
    throw new ForbiddenError(`You are not the owner of package '${name}'`);
  }

  const verList = await db
    .select()
    .from(packageVersions)
    .where(
      and(
        eq(packageVersions.packageId, pkg.id),
        eq(packageVersions.version, version),
      ),
    )
    .limit(1);

  if (verList.length === 0) {
    throw new NotFoundError(
      `Version '${version}' not found for package '${name}'`,
    );
  }

  const ver = verList[0];

  if (ver.status !== 'pending' && !user.roles.includes('admin')) {
    throw new ForbiddenError(
      `Cannot modify package version '${version}' with status '${ver.status}'`,
    );
  }

  const body = (await c.req.json()) as Record<string, unknown>;

  if (body.entry !== undefined) {
    await db
      .update(packageVersions)
      .set({ entry: body.entry as string })
      .where(eq(packageVersions.id, ver.id));
  }

  return c.json({ message: 'Version updated successfully' });
});

// DELETE /v1/packages/:name/:version - Delete a version (Admin auth)
packagesRouter.delete('/:name/:version', requireAuth, async (c) => {
  const name = c.req.param('name').toLowerCase();
  const version = c.req.param('version');
  const user = c.get('user');
  if (!user) {
    throw new UnauthorizedError();
  }

  if (!user.roles.includes('admin')) {
    throw new ForbiddenError('Admin role required to delete a package version');
  }

  const pkgList = await db
    .select()
    .from(packages)
    .where(eq(packages.name, name))
    .limit(1);

  if (pkgList.length === 0) {
    throw new NotFoundError(`Package '${name}' not found`);
  }

  const verList = await db
    .select()
    .from(packageVersions)
    .where(
      and(
        eq(packageVersions.packageId, pkgList[0].id),
        eq(packageVersions.version, version),
      ),
    )
    .limit(1);

  if (verList.length === 0) {
    throw new NotFoundError(
      `Version '${version}' not found for package '${name}'`,
    );
  }

  const ver = verList[0];

  // Delete S3 files
  const fileRows = await db
    .select({ s3Key: packageFiles.s3Key })
    .from(packageFiles)
    .where(eq(packageFiles.versionId, ver.id));

  for (const f of fileRows) {
    await deleteS3Object(f.s3Key);
  }
  await deleteS3Object(ver.archiveS3Key);

  // Delete DB row (cascades to files and dependencies)
  await db.delete(packageVersions).where(eq(packageVersions.id, ver.id));

  return c.json({ message: `Version '${version}' of '${name}' deleted` });
});

export default packagesRouter;
