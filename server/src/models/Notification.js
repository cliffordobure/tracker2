import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'trip_started',
        'kid_picked_up',
        'kid_dropped_off',
        'trip_completed',
        'trip_cancelled',
        'trip_assigned',
        'late_pickup_request',
        'assignment',
        'teacher_note',
        'attendance_alert',
        'diary',
        'announcement',
        'message',
        'reminder',
        'system',
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
    kidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kid' },
    key: { type: String, default: '' },
    link: { type: String, default: '' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index(
  { userId: 1, key: 1 },
  { unique: true, partialFilterExpression: { key: { $gt: '' } } }
);

export const Notification = mongoose.model('Notification', notificationSchema);
