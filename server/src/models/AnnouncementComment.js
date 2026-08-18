import mongoose from 'mongoose';

const announcementCommentSchema = new mongoose.Schema(
  {
    announcementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Announcement', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    authorName: { type: String, default: 'Parent', trim: true },
    authorRole: { type: String, default: 'Parent', trim: true },
    authorPhotoUrl: { type: String, default: '' },
    body: { type: String, required: true, trim: true, maxlength: 800 },
    sample: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const AnnouncementComment = mongoose.model('AnnouncementComment', announcementCommentSchema);
