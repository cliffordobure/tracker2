import mongoose from 'mongoose';

const vehicleRecordSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true, index: true },
    kind: {
      type: String,
      enum: ['maintenance', 'fuel', 'document', 'note', 'insurance', 'assignment', 'activity'],
      required: true,
      index: true,
    },
    title: { type: String, default: '', trim: true },
    detail: { type: String, default: '', trim: true, maxlength: 800 },
    actorName: { type: String, default: '', trim: true },
    actorRole: { type: String, default: '', trim: true },
    amount: { type: Number, default: null },
    liters: { type: Number, default: null },
    occurredAt: { type: Date, default: Date.now, index: true },
    url: { type: String, default: '' },
    fileName: { type: String, default: '' },
    publicId: { type: String, default: '' },
  },
  { timestamps: true }
);

vehicleRecordSchema.index({ busId: 1, occurredAt: -1 });

export const VehicleRecord = mongoose.model('VehicleRecord', vehicleRecordSchema);
