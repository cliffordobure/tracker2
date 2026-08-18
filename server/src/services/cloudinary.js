import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

const FOLDERS = [
  'kids',
  'drivers',
  'users',
  'schools',
  'leave',
  'announcements',
  'attachments',
  'assignments',
  'diary',
  'general',
];

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp',
]);

const RAW_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

const LIMITS = {
  image: 8 * 1024 * 1024,
  video: 60 * 1024 * 1024,
  raw: 15 * 1024 * 1024,
};

function configFromEnv() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  return { cloud_name, api_key, api_secret };
}

export function isCloudinaryConfigured() {
  const { cloud_name, api_key, api_secret } = configFromEnv();
  return Boolean(cloud_name && api_key && api_secret);
}

export function ensureCloudinary() {
  if (!isCloudinaryConfigured()) {
    const err = new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
    err.statusCode = 503;
    throw err;
  }
  const cfg = configFromEnv();
  cloudinary.config({ ...cfg, secure: true });
  return cloudinary;
}

export function allowedFolders() {
  return [...FOLDERS];
}

export function normalizeFolder(folder) {
  const key = String(folder || 'general').trim().toLowerCase();
  if (key === 'avatars') return 'users';
  return FOLDERS.includes(key) ? key : 'general';
}

export function resourceTypeForMime(mime = '') {
  const type = String(mime).toLowerCase();
  if (IMAGE_MIMES.has(type) || type.startsWith('image/')) return 'image';
  if (VIDEO_MIMES.has(type) || type.startsWith('video/')) return 'video';
  if (RAW_MIMES.has(type) || type.startsWith('application/') || type.startsWith('text/')) return 'raw';
  return null;
}

export function maxBytesForResource(resourceType) {
  return LIMITS[resourceType] || LIMITS.raw;
}

export function isAllowedMime(mime) {
  return resourceTypeForMime(mime) != null;
}

export function uploadBuffer({ buffer, folder, filename, mime, schoolId }) {
  const cloud = ensureCloudinary();
  const resourceType = resourceTypeForMime(mime) || 'auto';
  const safeFolder = normalizeFolder(folder);
  const schoolPart = schoolId ? String(schoolId) : 'shared';
  const publicFolder = `school-kids/${schoolPart}/${safeFolder}`;

  return new Promise((resolve, reject) => {
    const stream = cloud.uploader.upload_stream(
      {
        folder: publicFolder,
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        filename_override: filename || undefined,
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
    Readable.from(buffer).pipe(stream);
  });
}

export async function destroyCloudinaryAsset(publicId, resourceType = 'image') {
  if (!publicId) return;
  const cloud = ensureCloudinary();
  await cloud.uploader.destroy(publicId, { resource_type: resourceType || 'image' });
}
