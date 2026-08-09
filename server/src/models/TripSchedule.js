import mongoose from 'mongoose';

const tripScheduleSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
    scheduleType: {
      type: String,
      enum: ['ONE_TIME', 'EVERY_DAY', 'WEEKDAYS', 'CUSTOM_DAYS'],
      required: true,
    },
    customDays: [{ type: Number, min: 0, max: 6 }],
    period: {
      type: String,
      enum: ['morning', 'afternoon', 'evening'],
      required: true,
    },
    direction: { type: String, enum: ['to_school', 'to_home'], required: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    scheduledTime: { type: String, default: '06:30' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    kidIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Kid' }],
  },
  { timestamps: true }
);

export const TripSchedule = mongoose.model('TripSchedule', tripScheduleSchema);
