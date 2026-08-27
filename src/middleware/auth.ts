import type { MiddlewareHandler } from 'hono';
import { verifyJWT } from '@/lib/auth';
import { ForbiddenError, UnauthorizedError } from '@/middleware/error-handler';
import type { HonoEnv } from '@/types';

/**
 * Middleware handler that enforces authentication via Bearer JWT in the Authorization header.
 * Sets the authenticated user context on Hono environment variables.
 *
 * @param c - Hono context object.
 * @param next - Next middleware continuation callback.
 */
export const requireAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    throw new UnauthorizedError('Token not provided');
  }

  try {
    const user = await verifyJWT(token);
    c.set('user', user);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new UnauthorizedError(errorMessage || 'Invalid authentication token');
  }

  await next();
};

/**
 * Middleware handler that optionally verifies a Bearer JWT if present in the Authorization header.
 * Attaches user context if valid, otherwise continues without setting user context.
 *
 * @param c - Hono context object.
 * @param next - Next middleware continuation callback.
 */
export const optionalAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      try {
        const user = await verifyJWT(token);
        c.set('user', user);
      } catch {}
    }
  }
  await next();
};

/**
 * Middleware factory that creates a handler enforcing that the authenticated user possesses a specified role.
 *
 * @param role - Role required to access the endpoint.
 * @returns Hono middleware handler function.
 */
export const requireRole = (role: string): MiddlewareHandler<HonoEnv> => {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!user.roles.includes(role)) {
      throw new ForbiddenError(`Role '${role}' required for this resource`);
    }

    await next();
  };
};
