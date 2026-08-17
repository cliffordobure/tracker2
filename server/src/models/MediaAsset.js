import mongoose from 'mongoose';

const mediaAssetSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    folder: {
      type: String,
      enum: ['kids', 'drivers', 'users', 'schools', 'leave', 'announcements', 'attachments', 'general'],
      default: 'general',
      index: true,
    },
    url: { type: String, required: true },
    publicId: { type: String, required: true, index: true },
    resourceType: { type: String, enum: ['image', 'video', 'raw'], required: true },
    format: { type: String, default: '' },
    bytes: { type: Number, default: 0 },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
  },
  { timestamps: true }
);

export const MediaAsset = mongoose.model('MediaAsset', mediaAssetSchema);
