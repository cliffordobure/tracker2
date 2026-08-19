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
    schoolCode: { type: String, default: '', trim: true },
    website: { type: String, default: '', trim: true },
    schoolType: { type: String, default: '', trim: true },
    timezone: { type: String, default: '', trim: true },
    settings: {
      dateFormat: { type: String, default: '' },
      currency: { type: String, default: '' },
      itemsPerPage: { type: Number },
      autoArchiveTrips: { type: Boolean, default: false },
      maskParentPhones: { type: Boolean, default: false },
      allowDataExport: { type: Boolean, default: false },
      enableAuditLogs: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export const School = mongoose.model('School', schoolSchema);
