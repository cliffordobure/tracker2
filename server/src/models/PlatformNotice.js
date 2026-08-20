import mongoose from 'mongoose';

const platformNoticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    audience: {
      type: String,
      enum: ['all', 'school_admins', 'parents', 'drivers', 'teachers'],
      default: 'all',
    },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

platformNoticeSchema.index({ createdAt: -1 });

export const PlatformNotice = mongoose.model('PlatformNotice', platformNoticeSchema);
