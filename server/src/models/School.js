import mongoose from 'mongoose';

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    logoPublicId: { type: String, default: '' },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    supportEmail: { type: String, default: '', trim: true },
    supportPhone: { type: String, default: '', trim: true },
    supportHours: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

export const School = mongoose.model('School', schoolSchema);
