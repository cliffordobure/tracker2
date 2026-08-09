import mongoose from 'mongoose';

const tripSchema = new mongoose.Schema(
  {
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    direction: { type: String, enum: ['to_school', 'to_home'], required: true },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'completed', 'cancelled'],
      default: 'active',
    },
    kidIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Kid' }],
    startedAt: { type: Date, default: Date.now },
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
