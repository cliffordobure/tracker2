import mongoose from 'mongoose';

const tripSchema = new mongoose.Schema(
  {
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', default: null },
    direction: { type: String, enum: ['to_school', 'to_home'], required: true },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    sequence: { type: Number, default: 1 },
    scheduledFor: { type: Date, default: null },
    kidIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Kid' }],
    startedAt: { type: Date },
    endedAt: { type: Date },
    latestLocation: {
      lat: Number,
      lng: Number,
      heading: Number,
      speed: Number,
      at: Date,
    },
  },
  { timestamps: true }
);

export const Trip = mongoose.model('Trip', tripSchema);
