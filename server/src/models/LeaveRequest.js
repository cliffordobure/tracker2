import mongoose from 'mongoose';

const leaveRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    kidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kid', required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    leaveType: {
      type: String,
      enum: ['vacation', 'sick', 'family', 'other'],
      default: 'vacation',
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    reason: { type: String, default: '', trim: true, maxlength: 250 },
    notes: { type: String, default: '', trim: true, maxlength: 500 },
    attachmentName: { type: String, default: '' },
    attachmentUrl: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

export const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);
