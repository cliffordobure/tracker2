import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ticketNo: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, default: '', trim: true, maxlength: 2000 },
    category: {
      type: String,
      enum: ['general', 'transport', 'account', 'leave', 'privacy', 'guides'],
      default: 'general',
    },
    status: {
      type: String,
      enum: ['open', 'pending', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
    sourceKey: { type: String, default: '', index: true },
  },
  { timestamps: true }
);

supportTicketSchema.index({ parentId: 1, createdAt: -1 });

export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
