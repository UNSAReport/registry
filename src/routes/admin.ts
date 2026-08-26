import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '@/db';
import { packages, packageVersions, trustedUsers } from '@/db/schema';
import { requireAuth, requireRole } from '@/middleware/auth';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/middleware/error-handler';
import type { HonoEnv } from '@/types';

const adminRouter = new Hono<HonoEnv>();

// Protect all admin routes with auth + admin role
adminRouter.use('*', requireAuth, requireRole('admin'));

// GET /v1/admin/pending - List all pending package versions
adminRouter.get('/pending', async (c) => {
  const pendingRows = await db
    .select({
      packageId: packages.id,
      name: packages.name,
      displayName: packages.displayName,
      authorId: packages.authorId,
      versionId: packageVersions.id,
      version: packageVersions.version,
      entry: packageVersions.entry,
      fileCount: packageVersions.fileCount,
      createdAt: packageVersions.createdAt,
    })
    .from(packageVersions)
    .innerJoin(packages, eq(packageVersions.packageId, packages.id))
    .where(eq(packageVersions.status, 'pending'))
    .orderBy(desc(packageVersions.createdAt));

  return c.json({ pending: pendingRows });
});

// POST /v1/admin/packages/:name/:version/approve - Approve version
adminRouter.post('/packages/:name/:version/approve', async (c) => {
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

  const pkg = pkgList[0];

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
  const now = new Date();

  // Update package version status
  await db
    .update(packageVersions)
    .set({
      status: 'approved',
      approvedAt: now,
      rejectionReason: null,
    })
    .where(eq(packageVersions.id, ver.id));

  // Update package status and latestVersion
  await db
    .update(packages)
    .set({
      status: 'approved',
      latestVersion: version,
      updatedAt: now,
    })
    .where(eq(packages.id, pkg.id));

  return c.json({
    message: `Version '${version}' of package '${name}' approved successfully`,
  });
});

// POST /v1/admin/packages/:name/:version/reject - Reject version
adminRouter.post('/packages/:name/:version/reject', async (c) => {
  const name = c.req.param('name').toLowerCase();
  const version = c.req.param('version');

  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    // optional body
  }

  const reason = (body.reason as string) || 'No reason provided';

  const pkgList = await db
    .select()
    .from(packages)
    .where(eq(packages.name, name))
    .limit(1);

  if (pkgList.length === 0) {
    throw new NotFoundError(`Package '${name}' not found`);
  }

  const pkg = pkgList[0];

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
  const now = new Date();

  // Update package version status
  await db
    .update(packageVersions)
    .set({
      status: 'rejected',
      rejectionReason: reason,
    })
    .where(eq(packageVersions.id, ver.id));

  // Check if package has any approved versions remaining
  const approvedCount = await db
    .select({ id: packageVersions.id })
    .from(packageVersions)
    .where(
      and(
        eq(packageVersions.packageId, pkg.id),
        eq(packageVersions.status, 'approved'),
      ),
    );

  if (approvedCount.length === 0) {
    await db
      .update(packages)
      .set({
        status: 'rejected',
        rejectionReason: reason,
        updatedAt: now,
      })
      .where(eq(packages.id, pkg.id));
  }

  return c.json({
    message: `Version '${version}' of package '${name}' rejected`,
    reason,
  });
});

// GET /v1/admin/trusted - List all trusted users
adminRouter.get('/trusted', async (c) => {
  const users = await db.select().from(trustedUsers);
  return c.json({ trustedUsers: users });
});

// POST /v1/admin/trusted - Grant trusted status
adminRouter.post('/trusted', async (c) => {
  const user = c.get('user');
  if (!user) {
    throw new UnauthorizedError();
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    throw new ValidationError('Invalid JSON body');
  }

  if (!body.userId || typeof body.userId !== 'string') {
    throw new ValidationError('Field "userId" (UUID) is required', {
      field: 'userId',
    });
  }

  const targetUserId = body.userId.trim();

  const existing = await db
    .select()
    .from(trustedUsers)
    .where(eq(trustedUsers.userId, targetUserId))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(`User '${targetUserId}' is already a trusted user`);
  }

  const now = new Date();

  await db.insert(trustedUsers).values({
    userId: targetUserId,
    grantedBy: user.id,
    createdAt: now,
  });

  return c.json(
    {
      userId: targetUserId,
      grantedBy: user.id,
      createdAt: now,
    },
    201,
  );
});

// DELETE /v1/admin/trusted/:userId - Revoke trusted status
adminRouter.delete('/trusted/:userId', async (c) => {
  const targetUserId = c.req.param('userId');

  const existing = await db
    .select()
    .from(trustedUsers)
    .where(eq(trustedUsers.userId, targetUserId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError(`Trusted user '${targetUserId}' not found`);
  }

  await db.delete(trustedUsers).where(eq(trustedUsers.userId, targetUserId));

  return c.json({
    message: `Trusted status revoked for user '${targetUserId}'`,
  });
});

export default adminRouter;
