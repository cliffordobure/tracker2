import mongoose from 'mongoose';

const schoolOutingSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    location: { type: String, default: '', trim: true, maxlength: 160 },
    notes: { type: String, default: '', trim: true, maxlength: 2000 },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, default: null },
    grade: { type: String, default: '', trim: true, index: true },
    audience: { type: String, default: '', trim: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', default: null },
    busId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', default: null },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: null },
    kidIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Kid' }],
    busCount: { type: Number, default: 1, min: 0, max: 50 },
    teacherCount: { type: Number, default: 1, min: 0, max: 50 },
    status: {
      type: String,
      enum: ['upcoming', 'completed', 'cancelled'],
      default: 'upcoming',
      index: true,
    },
    sourceKey: { type: String, default: '', index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

schoolOutingSchema.index({ schoolId: 1, startAt: 1 });
schoolOutingSchema.index(
  { schoolId: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $gt: '' } } }
);

export const SchoolOuting = mongoose.model('SchoolOuting', schoolOutingSchema);
