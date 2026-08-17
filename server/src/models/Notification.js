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
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
    kidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kid' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Notification = mongoose.model('Notification', notificationSchema);
