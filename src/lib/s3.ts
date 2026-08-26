import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import JSZip from 'jszip';
import { config } from '@/config';

export const s3Client = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: config.s3.forcePathStyle,
});

let bucketChecked = false;

export async function ensureBucketExists(): Promise<void> {
  if (bucketChecked) return;
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
    bucketChecked = true;
  } catch {
    try {
      await s3Client.send(
        new CreateBucketCommand({ Bucket: config.s3.bucket }),
      );
      bucketChecked = true;
    } catch (createErr) {
      console.warn('Could not ensure S3 bucket exists:', createErr);
    }
  }
}

export async function uploadS3Object(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType = 'application/octet-stream',
): Promise<string> {
  await ensureBucketExists();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: typeof body === 'string' ? Buffer.from(body) : body,
      ContentType: contentType,
    }),
  );
  return key;
}

export async function getPresignedUrl(
  key: string,
  expiresInSeconds = 600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
  });
  return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function deleteS3Object(key: string): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
      }),
    );
  } catch (err) {
    console.warn(`Failed to delete S3 key ${key}:`, err);
  }
}

export async function buildAndUploadZipArchive(
  s3Key: string,
  files: { path: string; content: Buffer }[],
): Promise<string> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  await uploadS3Object(s3Key, zipBuffer, 'application/zip');
  return s3Key;
}
