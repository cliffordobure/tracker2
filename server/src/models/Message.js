import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: String, enum: ['staff', 'parent'], required: true },
    senderName: { type: String, default: '', trim: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

export const Message = mongoose.model('Message', messageSchema);
