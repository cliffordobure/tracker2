import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    counterpartUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    type: { type: String, enum: ['direct', 'group'], default: 'direct', index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    roleLabel: { type: String, default: 'Teacher', trim: true, maxlength: 60 },
    avatarKind: { type: String, enum: ['teacher', 'admin', 'group'], default: 'teacher' },
    photoUrl: { type: String, default: '' },
    online: { type: Boolean, default: false },
    subtitle: { type: String, default: '', trim: true, maxlength: 80 },
    phone: { type: String, default: '', trim: true },
    lastMessage: { type: String, default: '', trim: true, maxlength: 400 },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    unreadCount: { type: Number, default: 0, min: 0 },
    archived: { type: Boolean, default: false, index: true },
    sourceKey: { type: String, default: '', index: true },
  },
  { timestamps: true }
);

conversationSchema.index({ parentId: 1, lastMessageAt: -1 });
conversationSchema.index(
  { parentId: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $gt: '' } } }
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
