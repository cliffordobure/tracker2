import mongoose from 'mongoose';

const stopSchema = new mongoose.Schema(
  {
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['home', 'school'], required: true },
    order: { type: Number, required: true, default: 0 },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    address: { type: String, default: '', trim: true, maxlength: 200 },
  },
  { timestamps: true }
);

export const Stop = mongoose.model('Stop', stopSchema);
