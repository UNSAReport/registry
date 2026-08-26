import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '@/db';
import { tags } from '@/db/schema';
import { requireAuth, requireRole } from '@/middleware/auth';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/middleware/error-handler';
import type { HonoEnv } from '@/types';

const tagsRouter = new Hono<HonoEnv>();

// GET /v1/tags - List all tags (grouped by parent)
tagsRouter.get('/', async (c) => {
  const allTags = await db.select().from(tags);

  const parentTags = allTags.filter((t) => !t.parentId);
  const childTagsMap = new Map<string, typeof allTags>();

  for (const t of allTags) {
    if (t.parentId) {
      const list = childTagsMap.get(t.parentId) || [];
      list.push(t);
      childTagsMap.set(t.parentId, list);
    }
  }

  const result = parentTags.map((parent) => ({
    ...parent,
    children: childTagsMap.get(parent.id) || [],
  }));

  return c.json({ tags: result });
});

// POST /v1/tags - Create tag (Admin auth)
tagsRouter.post('/', requireAuth, requireRole('admin'), async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    throw new ValidationError('Invalid JSON body');
  }

  if (!body.name || typeof body.name !== 'string') {
    throw new ValidationError('Tag "name" is required', { field: 'name' });
  }
  if (!body.displayName || typeof body.displayName !== 'string') {
    throw new ValidationError('Tag "displayName" is required', {
      field: 'displayName',
    });
  }

  const tagName = body.name.trim().toLowerCase();
  const displayName = body.displayName.trim();
  const parentId = (body.parentId as string) || null;

  const existingTag = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.name, tagName))
    .limit(1);

  if (existingTag.length > 0) {
    throw new ConflictError(`Tag '${tagName}' already exists`);
  }

  if (parentId) {
    const parentRow = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.id, parentId))
      .limit(1);

    if (parentRow.length === 0) {
      throw new NotFoundError(`Parent tag ID '${parentId}' not found`);
    }
  }

  const tagId = crypto.randomUUID();
  const now = new Date();

  await db.insert(tags).values({
    id: tagId,
    name: tagName,
    displayName,
    parentId,
    createdAt: now,
  });

  return c.json(
    {
      id: tagId,
      name: tagName,
      displayName,
      parentId,
      createdAt: now,
    },
    201,
  );
});

// DELETE /v1/tags/:id - Delete tag (Admin auth)
tagsRouter.delete('/:id', requireAuth, requireRole('admin'), async (c) => {
  const id = c.req.param('id');

  const existingTag = await db
    .select()
    .from(tags)
    .where(eq(tags.id, id))
    .limit(1);

  if (existingTag.length === 0) {
    throw new NotFoundError(`Tag ID '${id}' not found`);
  }

  await db.delete(tags).where(eq(tags.id, id));

  return c.json({ message: `Tag '${existingTag[0].name}' deleted` });
});

export default tagsRouter;
