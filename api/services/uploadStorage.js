import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const uploadsDirectory = fileURLToPath(new URL('../../uploads/', import.meta.url));

export class UploadStorageUnavailableError extends Error {
  constructor() {
    super('Upload storage is unavailable. Please try again later or contact support.');
    this.name = 'UploadStorageUnavailableError';
    this.code = 'UPLOAD_STORAGE_UNAVAILABLE';
  }
}

// Only an explicitly opted-in development process may write local uploads.
// Test processes fail closed too; unit tests use an injected, in-memory filesystem.
function localUploadsAllowed(env) {
  return env.NODE_ENV === 'development' &&
    env.ALLOW_LOCAL_UPLOADS === 'true' &&
    [undefined, '0', 'false'].includes(env.REPLIT_DEPLOYMENT) &&
    [undefined, 'legacy'].includes(env.STARTUP_MODE);
}

async function createClient(bucketId) {
  const { Client } = await import('@replit/object-storage');
  return new Client({ bucketId });
}

// Dependencies are injectable for isolated tests, never taken from request input.
export async function storeGeneralUpload(buffer, filename, mimeType, {
  env = process.env,
  clientFactory = createClient,
  filesystem = fs,
} = {}) {
  if (!filename || filename === '.' || filename === '..' ||
      filename !== path.basename(filename) || filename.includes('\\')) {
    throw new UploadStorageUnavailableError();
  }
  try {
    if (!env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim()) {
      throw new UploadStorageUnavailableError();
    }
    const client = await clientFactory(env.DEFAULT_OBJECT_STORAGE_BUCKET_ID);
    if (!client || typeof client.uploadFromStream !== 'function') {
      throw new UploadStorageUnavailableError();
    }
    const objectName = `public/uploads/${filename}`;
    const result = await client.uploadFromStream(objectName, Readable.from(buffer), {
      contentType: mimeType,
    });
    if (result?.ok === false) throw new UploadStorageUnavailableError();
    return `/api/obj/${objectName}`;
  } catch {
    // Recheck immediately before either filesystem operation, including mkdir.
    // No raw SDK/configuration error is logged or included in the public error.
    if (!localUploadsAllowed(env)) throw new UploadStorageUnavailableError();
    try {
      filesystem.mkdirSync(uploadsDirectory, { recursive: true });
      filesystem.writeFileSync(path.join(uploadsDirectory, filename), buffer);
      return `/uploads/${filename}`;
    } catch {
      throw new UploadStorageUnavailableError();
    }
  }
}
