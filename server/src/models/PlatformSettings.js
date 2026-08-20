import mongoose from 'mongoose';

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    platformName: { type: String, default: 'GREENFIELD SCHOOL', trim: true },
    tagline: { type: String, default: 'Transport Management System', trim: true },
    supportEmail: { type: String, default: '', trim: true },
    supportPhone: { type: String, default: '', trim: true },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);
