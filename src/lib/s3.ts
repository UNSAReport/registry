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

/**
 * Ensures that the configured S3 storage bucket exists, creating it if it does not already exist.
 */
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

/**
 * Uploads an object payload to S3 under the specified key and content type.
 *
 * @param key - Destination object key path in the S3 bucket.
 * @param body - Buffer, Uint8Array, or string content to upload.
 * @param contentType - MIME content type header (defaults to 'application/octet-stream').
 * @returns S3 key path of the uploaded object.
 */
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

/**
 * Generates a presigned URL for downloading an S3 object.
 *
 * @param key - S3 object key path to generate presigned URL for.
 * @param expiresInSeconds - Time in seconds until presigned URL expires (defaults to 600).
 * @returns Presigned GET URL string.
 */
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

/**
 * Deletes an object from the S3 storage bucket by key.
 *
 * @param key - S3 object key path to delete.
 */
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

/**
 * Packs multiple file entries into a ZIP archive and uploads it to S3.
 *
 * @param s3Key - S3 object key path for the zip archive.
 * @param files - Array of objects containing relative file paths and buffer contents.
 * @returns S3 key path of the uploaded zip archive.
 */
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
