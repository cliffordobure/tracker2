import mongoose from 'mongoose';

const busSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plate: { type: String, required: true, trim: true },
    label: { type: String, default: '', trim: true },
    model: { type: String, default: '', trim: true },
    color: { type: String, default: '', trim: true },
    seats: { type: Number, required: true, min: 1 },
    assistantName: { type: String, default: '', trim: true },
    assistantPhone: { type: String, default: '', trim: true },
    year: { type: Number, default: null },
    safetyFeatures: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Bus = mongoose.model('Bus', busSchema);
