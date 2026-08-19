import mongoose from 'mongoose';

const driverProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    vehiclePlate: { type: String, default: '' },
    vehicleModel: { type: String, default: '' },
    vehicleColor: { type: String, default: '' },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', default: null },
    assignedRouteIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Route' }],
    licenseNumber: { type: String, default: '', trim: true },
    licenseExpiry: { type: Date, default: null },
  },
  { timestamps: true }
);

export const DriverProfile = mongoose.model('DriverProfile', driverProfileSchema);
