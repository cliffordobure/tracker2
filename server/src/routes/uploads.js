import { Router } from 'express';
import multer from 'multer';
import { MediaAsset } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import {
  allowedFolders,
  destroyCloudinaryAsset,
  isAllowedMime,
  isCloudinaryConfigured,
  maxBytesForResource,
  normalizeFolder,
  resourceTypeForMime,
  uploadBuffer,
} from '../services/cloudinary.js';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 1 },
});

function schoolIdFor(req) {
  return req.user.schoolId || req.body?.schoolId || req.query.schoolId || null;
}

router.get('/status', (_req, res) => {
  res.json({
    configured: isCloudinaryConfigured(),
    folders: allowedFolders(),
    limits: {
      imageMb: 8,
      videoMb: 60,
      fileMb: 15,
    },
  });
});

router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File is too large (max 60MB).' });
      }
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const mime = req.file.mimetype || '';
    if (!isAllowedMime(mime)) {
      return res.status(400).json({
        error: 'Unsupported file type. Use an image, video, PDF, or Office document.',
      });
    }

    const resourceType = resourceTypeForMime(mime);
    const maxBytes = maxBytesForResource(resourceType);
    if (req.file.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      return res.status(400).json({ error: `This ${resourceType} may be at most ${mb}MB.` });
    }

    const folder = normalizeFolder(req.body.folder || req.query.folder);
    const schoolId = schoolIdFor(req);
    const result = await uploadBuffer({
      buffer: req.file.buffer,
      folder,
      filename: req.file.originalname,
      mime,
      schoolId,
    });

    const asset = await MediaAsset.create({
      schoolId: schoolId || null,
      uploadedBy: req.user.id,
      folder,
      url: result.secure_url || result.url,
      publicId: result.public_id,
      resourceType: result.resource_type || resourceType,
      format: result.format || '',
      bytes: result.bytes || req.file.size,
      originalName: req.file.originalname || '',
      mimeType: mime,
    });

    res.status(201).json({
      file: {
        id: asset._id.toString(),
        url: asset.url,
        publicId: asset.publicId,
        resourceType: asset.resourceType,
        format: asset.format,
        bytes: asset.bytes,
        originalName: asset.originalName,
        folder: asset.folder,
      },
    });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Upload failed' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const asset = await MediaAsset.findById(req.params.id);
    if (!asset) return res.status(404).json({ error: 'File not found' });

    const isOwner = asset.uploadedBy.toString() === req.user.id;
    const isStaff = ['super_admin', 'school_admin'].includes(req.user.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: 'Not allowed to delete this file' });
    }

    try {
      await destroyCloudinaryAsset(asset.publicId, asset.resourceType);
    } catch (cloudErr) {
      console.warn('Cloudinary destroy failed', cloudErr.message);
    }
    await asset.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
