import mongoose from 'mongoose';

const scheduleExceptionSchema = new mongoose.Schema(
  {
    scheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TripSchedule',
      required: true,
      index: true,
    },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    serviceDate: { type: Date, required: true },
    type: { type: String, enum: ['SKIP', 'OVERRIDE'], required: true },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', default: null },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    kidIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Kid' }],
    scheduledTime: { type: String, default: null },
  },
  { timestamps: true }
);

scheduleExceptionSchema.index({ scheduleId: 1, serviceDate: 1 }, { unique: true });

export const ScheduleException = mongoose.model('ScheduleException', scheduleExceptionSchema);
