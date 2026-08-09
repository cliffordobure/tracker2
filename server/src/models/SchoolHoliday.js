import mongoose from 'mongoose';

const schoolHolidaySchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    date: { type: Date, required: true },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

schoolHolidaySchema.index({ schoolId: 1, date: 1 }, { unique: true });

export const SchoolHoliday = mongoose.model('SchoolHoliday', schoolHolidaySchema);
