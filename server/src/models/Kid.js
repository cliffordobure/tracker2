import mongoose from 'mongoose';

const kidSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    parentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
    homeStopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stop' },
    grade: { type: String, default: '' },
    house: { type: String, default: '' },
    admissionNo: { type: String, default: '' },
    photoUrl: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Kid = mongoose.model('Kid', kidSchema);
