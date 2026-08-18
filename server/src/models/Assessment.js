import mongoose from 'mongoose';

const assessmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kid', required: true, index: true },
    subject: { type: String, required: true, trim: true },
    title: { type: String, default: 'Assessment', trim: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    kind: { type: String, enum: ['academic', 'behaviour', 'skill'], default: 'academic', index: true },
    date: { type: Date, default: Date.now, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

assessmentSchema.index({ kidId: 1, subject: 1, date: -1 });

export const Assessment = mongoose.model('Assessment', assessmentSchema);
