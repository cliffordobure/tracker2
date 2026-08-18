import mongoose from 'mongoose';

const locationPoint = {
  lat: Number,
  lng: Number,
  heading: Number,
  speed: Number,
  at: Date,
};

const tripSchema = new mongoose.Schema(
  {
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', default: null },
    scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'TripSchedule', default: null },
    period: {
      type: String,
      enum: ['morning', 'afternoon', 'evening'],
      default: null,
    },
    serviceDate: { type: Date, default: null },
    tripCode: { type: String, default: '' },
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
    startLocation: locationPoint,
    endLocation: locationPoint,
    latestLocation: locationPoint,
    stopNotes: {
      type: [
        {
          stopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stop' },
          text: { type: String, default: '', trim: true, maxlength: 500 },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    incidents: {
      type: [
        {
          type: {
            type: String,
            enum: ['accident', 'breakdown', 'traffic', 'road_block', 'weather', 'passenger', 'unsafe', 'other'],
            required: true,
          },
          severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
          details: { type: String, required: true, trim: true, maxlength: 500 },
          occurredAt: { type: Date, default: Date.now },
          location: {
            lat: Number,
            lng: Number,
            at: Date,
          },
          nextStopName: { type: String, default: '' },
          nextStopKm: { type: Number, default: null },
          photoUrls: { type: [String], default: [] },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

tripSchema.index({ scheduleId: 1, serviceDate: 1, period: 1 });
tripSchema.index({ driverId: 1, serviceDate: 1, status: 1 });
tripSchema.index({ schoolId: 1, status: 1 });

export const Trip = mongoose.model('Trip', tripSchema);
