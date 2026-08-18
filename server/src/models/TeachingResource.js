import mongoose from 'mongoose';

const teachingResourceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    subject: { type: String, default: '', trim: true },
    grade: { type: String, default: '', trim: true },
    fileType: {
      type: String,
      enum: ['pdf', 'ppt', 'doc', 'image', 'link', 'other'],
      default: 'other',
    },
    url: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    originalName: { type: String, default: '' },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    kind: {
      type: String,
      enum: ['mine', 'shared', 'recommended', 'template'],
      default: 'mine',
      index: true,
    },
    sharedByName: { type: String, default: '' },
    favoriteUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sourceKey: { type: String, default: '', index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

teachingResourceSchema.index({ schoolId: 1, kind: 1, createdAt: -1 });
teachingResourceSchema.index(
  { schoolId: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $gt: '' } } }
);

export const TeachingResource = mongoose.model('TeachingResource', teachingResourceSchema);
