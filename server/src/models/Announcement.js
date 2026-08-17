import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['general', 'class', 'transport', 'events', 'urgent'],
      default: 'general',
      index: true,
    },
    authorName: { type: String, default: 'Admin' },
    attachmentName: { type: String, default: '' },
    attachmentUrl: { type: String, default: '' },
    attachmentPublicId: { type: String, default: '' },
    active: { type: Boolean, default: true },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Announcement = mongoose.model('Announcement', announcementSchema);
