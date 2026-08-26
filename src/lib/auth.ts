import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '@/config';
import type { JWTPayload, UserContext } from '@/types';

let jwksClient: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwksClient) {
    jwksClient = createRemoteJWKSet(new URL(config.idpJwksUrl));
  }
  return jwksClient;
}

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
