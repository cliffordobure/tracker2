import mongoose from 'mongoose';

const outingPermissionSchema = new mongoose.Schema(
  {
    outingId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolOuting', required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kid', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'granted', 'denied'],
      default: 'pending',
      index: true,
    },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

outingPermissionSchema.index({ outingId: 1, parentId: 1, kidId: 1 }, { unique: true });

export const OutingPermission = mongoose.model('OutingPermission', outingPermissionSchema);
