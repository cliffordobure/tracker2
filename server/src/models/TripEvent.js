import mongoose from 'mongoose';

const tripEventSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
    kidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kid', required: true },
    type: { type: String, enum: ['picked_up', 'dropped_off', 'not_picked_up'], required: true },
    at: { type: Date, default: Date.now },
    location: {
      lat: Number,
      lng: Number,
    },
  },
  { timestamps: true }
);

export const TripEvent = mongoose.model('TripEvent', tripEventSchema);
