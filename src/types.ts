/**
 * Represents the structure of a decoded JWT payload.
 */
export interface JWTPayload {
  sub: string;
  email?: string;
  name?: string;
  roles?: string[];
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
}

/**
 * Context information for an authenticated user attached to Hono request state.
 */
export interface UserContext {
  id: string;
  email?: string;
  roles: string[];
}

/**
 * Manifest object defining package metadata, files, entry point, tags, and dependencies.
 */
export interface Manifest {
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  entry?: string;
  tags?: string[];
  dependencies?: Record<string, string>;
  files: string[];
}

/**
 * Standard API error response body layout.
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Request payload for resolving package dependencies.
 */
export interface DependencyResolveRequest {
  packages: Record<string, string>;
}

/**
 * Represents a fully resolved package with its S3 download URL and file list.
 */
export interface ResolvedPackage {
  name: string;
  version: string;
  archive_url: string;
  files: string[];
}

/**
 * Response payload containing the list of resolved packages.
 */
export interface DependencyResolveResponse {
  resolved: ResolvedPackage[];
}

/**
 * Environment type configuration for Hono application context variables.
 */
export type HonoEnv = {
  Variables: {
    user?: UserContext;
  };
};
