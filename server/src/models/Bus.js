import mongoose from 'mongoose';

const busSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plate: { type: String, required: true, trim: true },
    label: { type: String, default: '', trim: true },
    model: { type: String, default: '', trim: true },
    color: { type: String, default: '', trim: true },
    seats: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Bus = mongoose.model('Bus', busSchema);
