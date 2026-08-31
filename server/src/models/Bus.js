import mongoose from 'mongoose';

const busSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', default: null },
    plate: { type: String, required: true, trim: true },
    label: { type: String, default: '', trim: true },
    model: { type: String, default: '', trim: true },
    color: { type: String, default: '', trim: true },
    seats: { type: Number, required: true, min: 1 },
    assistantName: { type: String, default: '', trim: true },
    assistantPhone: { type: String, default: '', trim: true },
    year: { type: Number, default: null },
    safetyFeatures: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
    code: { type: String, default: '', trim: true },
    photoUrl: { type: String, default: '' },
    photoPublicId: { type: String, default: '' },
    vehicleType: {
      type: String,
      enum: ['', 'school_bus', 'bus', 'minibus', 'van'],
      default: '',
    },
    fuelType: {
      type: String,
      enum: ['', 'diesel', 'petrol', 'hybrid', 'electric'],
      default: '',
    },
    serviceStatus: {
      type: String,
      enum: ['active', 'maintenance', 'out_of_service'],
      default: 'active',
    },
    insuranceExpiry: { type: Date, default: null },
    insuranceProvider: { type: String, default: '', trim: true },
    insurancePolicyNo: { type: String, default: '', trim: true },
    nextServiceAt: { type: Date, default: null },
    lastServiceAt: { type: Date, default: null },
    chassisNumber: { type: String, default: '', trim: true },
    engineNumber: { type: String, default: '', trim: true },
    mileage: { type: Number, default: null, min: 0 },
  },
  { timestamps: true }
);

export const Bus = mongoose.model('Bus', busSchema);
