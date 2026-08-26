export const config = {
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://registry:registrypassword@localhost:5432/registry_db',
  idpIssuer: process.env.IDP_ISSUER || 'https://auth.unsareport.org',
  idpJwksUrl:
    process.env.IDP_JWKS_URL ||
    `${process.env.IDP_ISSUER || 'https://auth.unsareport.org'}/.well-known/jwks.json`,
  port: Number.parseInt(process.env.PORT || '3001', 10),
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS || 'http://localhost:5173'
  ).split(','),
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    bucket: process.env.S3_BUCKET || 'unsareport-registry',
    accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  },
  maxPendingPackages: Number.parseInt(
    process.env.MAX_PENDING_PACKAGES || '5',
    10,
  ),
};
