import mongoose from 'mongoose';

const lessonPlanSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    subject: { type: String, default: '', trim: true },
    grade: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['draft', 'planned', 'in_progress', 'published'],
      default: 'draft',
      index: true,
    },
    scheduledDate: { type: Date, default: null, index: true },
    durationMinutes: { type: Number, default: 40, min: 0, max: 240 },
    objectives: { type: String, default: '', trim: true, maxlength: 1000 },
    favorite: { type: Boolean, default: false, index: true },
    sourceKey: { type: String, default: '', index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

lessonPlanSchema.index({ schoolId: 1, teacherId: 1, scheduledDate: 1, createdAt: -1 });
lessonPlanSchema.index(
  { schoolId: 1, teacherId: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $gt: '' } } }
);

export const LessonPlan = mongoose.model('LessonPlan', lessonPlanSchema);
