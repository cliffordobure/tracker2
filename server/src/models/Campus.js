import mongoose from 'mongoose';

const campusSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    isDefault: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

campusSchema.index({ schoolId: 1, name: 1 }, { unique: true });

export const Campus = mongoose.model('Campus', campusSchema);
