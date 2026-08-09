import mongoose from 'mongoose';

const locationPingSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    heading: { type: Number },
    speed: { type: Number },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export const LocationPing = mongoose.model('LocationPing', locationPingSchema);
