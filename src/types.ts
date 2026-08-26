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

export interface UserContext {
  id: string;
  email?: string;
  roles: string[];
}

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

export interface ApiErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DependencyResolveRequest {
  packages: Record<string, string>;
}

export interface ResolvedPackage {
  name: string;
  version: string;
  archive_url: string;
  files: string[];
}

export interface DependencyResolveResponse {
  resolved: ResolvedPackage[];
}

export type HonoEnv = {
  Variables: {
    user?: UserContext;
  };
};
