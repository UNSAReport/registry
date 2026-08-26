import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '@/db';
import { packageFiles, packages, packageVersions } from '@/db/schema';
import { resolveDependencyTree } from '@/lib/dependency-resolver';
import { getPresignedUrl } from '@/lib/s3';
import { NotFoundError, ValidationError } from '@/middleware/error-handler';
import type { DependencyResolveRequest, HonoEnv } from '@/types';

const downloadRouter = new Hono<HonoEnv>();

// GET /v1/packages/:name/:version/files - List files in version
downloadRouter.get('/:name/:version/files', async (c) => {
  const name = c.req.param('name').toLowerCase();
  const version = c.req.param('version');

  const pkgList = await db
    .select({ id: packages.id })
    .from(packages)
    .where(eq(packages.name, name))
    .limit(1);

  if (pkgList.length === 0) {
    throw new NotFoundError(`Package '${name}' not found`);
  }

  const verList = await db
    .select({ id: packageVersions.id, status: packageVersions.status })
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

  const filesRows = await db
    .select({
      path: packageFiles.path,
      size: packageFiles.size,
      checksum: packageFiles.checksum,
    })
    .from(packageFiles)
    .where(eq(packageFiles.versionId, verList[0].id));

  return c.json({
    package: name,
    version,
    files: filesRows,
  });
});

// GET /v1/packages/:name/:version/files/* - Download a specific file
downloadRouter.get('/:name/:version/files/*', async (c) => {
  const name = c.req.param('name').toLowerCase();
  const version = c.req.param('version');
  const filePath = c.req.param('*');

  if (!filePath) {
    throw new ValidationError('File path is required');
  }

  const pkgList = await db
    .select({ id: packages.id })
    .from(packages)
    .where(eq(packages.name, name))
    .limit(1);

  if (pkgList.length === 0) {
    throw new NotFoundError(`Package '${name}' not found`);
  }

  const verList = await db
    .select({ id: packageVersions.id, status: packageVersions.status })
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

  const cleanPath = filePath.replace(/^[/\\]+/, '');

  const fileList = await db
    .select({ s3Key: packageFiles.s3Key, checksum: packageFiles.checksum })
    .from(packageFiles)
    .where(
      and(
        eq(packageFiles.versionId, verList[0].id),
        eq(packageFiles.path, cleanPath),
      ),
    )
    .limit(1);

  if (fileList.length === 0) {
    throw new NotFoundError(
      `File '${cleanPath}' not found in package '${name}' version '${version}'`,
    );
  }

  const presignedUrl = await getPresignedUrl(fileList[0].s3Key);

  // Redirect or JSON presigned URL based on Accept header
  const accept = c.req.header('Accept') || '';
  if (accept.includes('application/json')) {
    return c.json({
      url: presignedUrl,
      checksum: fileList[0].checksum,
    });
  }

  return c.redirect(presignedUrl, 302);
});

// GET /v1/packages/:name/:version/archive - Download full archive
downloadRouter.get('/:name/:version/archive', async (c) => {
  const name = c.req.param('name').toLowerCase();
  const version = c.req.param('version');

  const pkgList = await db
    .select({ id: packages.id })
    .from(packages)
    .where(eq(packages.name, name))
    .limit(1);

  if (pkgList.length === 0) {
    throw new NotFoundError(`Package '${name}' not found`);
  }

  const verList = await db
    .select({
      id: packageVersions.id,
      archiveS3Key: packageVersions.archiveS3Key,
      status: packageVersions.status,
    })
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

  const presignedUrl = await getPresignedUrl(verList[0].archiveS3Key);

  return c.json({
    package: name,
    version,
    archive_url: presignedUrl,
  });
});

// POST /v1/resolve - Resolve full dependency tree
downloadRouter.post('/resolve', async (c) => {
  let body: DependencyResolveRequest;
  try {
    body = await c.req.json();
  } catch {
    throw new ValidationError('Invalid JSON body');
  }

  if (
    !body?.packages ||
    typeof body.packages !== 'object' ||
    Object.keys(body.packages).length === 0
  ) {
    throw new ValidationError(
      'Field "packages" must be a non-empty object mapping package names to semver ranges',
      { field: 'packages' },
    );
  }

  const resolved = await resolveDependencyTree(body.packages);

  return c.json({ resolved });
});

export default downloadRouter;
