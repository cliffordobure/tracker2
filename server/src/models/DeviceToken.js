import mongoose from 'mongoose';

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platform: { type: String, enum: ['fcm', 'web_push'], required: true },
    token: { type: String, required: true },
    keys: {
      p256dh: String,
      auth: String,
    },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

deviceTokenSchema.index({ userId: 1, platform: 1, token: 1 }, { unique: true });

export const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);
