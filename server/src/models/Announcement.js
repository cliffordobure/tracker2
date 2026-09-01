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
    kind: {
      type: String,
      enum: ['important', 'general', 'information', 'event', 'reminder'],
      default: 'general',
      index: true,
    },
    scope: {
      type: String,
      enum: ['school', 'class'],
      default: 'school',
      index: true,
    },
    grade: { type: String, default: '', trim: true, index: true },
    grades: { type: [String], default: [], index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    audience: { type: String, default: '' },
    icon: { type: String, default: '' },
    sourceKey: { type: String, default: '', index: true },
    archived: { type: Boolean, default: false, index: true },
    authorName: { type: String, default: 'Admin' },
    attachmentName: { type: String, default: '' },
    attachmentUrl: { type: String, default: '' },
    attachmentPublicId: { type: String, default: '' },
    attachmentSize: { type: Number, default: 0 },
    reactionCount: { type: Number, default: 0, min: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    acknowledgedBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
      },
    ],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    active: { type: Boolean, default: true },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

announcementSchema.index(
  { schoolId: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $gt: '' } } }
);

export const Announcement = mongoose.model('Announcement', announcementSchema);
