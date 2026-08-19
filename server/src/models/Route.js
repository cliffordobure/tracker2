import mongoose from 'mongoose';

const routeSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    code: { type: String, default: '', trim: true },
    estimatedMinutes: { type: Number, default: null, min: 0, max: 300 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Route = mongoose.model('Route', routeSchema);
