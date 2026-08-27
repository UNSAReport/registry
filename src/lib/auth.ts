import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '@/config';
import type { JWTPayload, UserContext } from '@/types';

let jwksClient: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Initializes and caches the remote JSON Web Key Set (JWKS) client instance for IDP token verification.
 *
 * @returns Remote JWKS set client instance.
 */
function getJWKS() {
  if (!jwksClient) {
    jwksClient = createRemoteJWKSet(new URL(config.idpJwksUrl));
  }
  return jwksClient;
}

/**
 * Verifies a JWT token using the configured Identity Provider's JWKS and issuer.
 *
 * @param token - Bearer JWT string to verify.
 * @returns Decoded user context containing user ID, optional email, and assigned roles.
 * @throws Error if JWT verification fails or subject claims are missing.
 */
export async function verifyJWT(token: string): Promise<UserContext> {
  try {
    const JWKS = getJWKS();
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: config.idpIssuer,
    });

    const jwtPayload = payload as unknown as JWTPayload;

    if (!jwtPayload.sub) {
      throw new Error('JWT subject (sub) missing');
    }

    const roles = Array.isArray(jwtPayload.roles) ? jwtPayload.roles : [];

    return {
      id: jwtPayload.sub,
      email: jwtPayload.email,
      roles,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(`Token verification failed: ${errorMessage}`);
  }
}
