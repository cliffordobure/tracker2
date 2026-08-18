import mongoose from 'mongoose';

const academicTermSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    year: { type: Number, required: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

academicTermSchema.index({ schoolId: 1, year: 1, name: 1 }, { unique: true });

export const AcademicTerm = mongoose.model('AcademicTerm', academicTermSchema);
