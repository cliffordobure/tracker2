import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    resourceType: { type: String, enum: ['image', 'video', 'raw'], default: 'image' },
    originalName: { type: String, default: '' },
  },
  { _id: false }
);

const diaryEntrySchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, default: '', trim: true, maxlength: 4000 },
    label: {
      type: String,
      enum: ['general', 'class', 'activity', 'meal', 'academic', 'health', 'lesson', 'behaviour'],
      default: 'general',
    },
    grade: { type: String, default: '', trim: true },
    kidIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Kid' }],
    media: { type: [mediaSchema], default: [] },
    private: { type: Boolean, default: false },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    learningObjectives: { type: String, default: '', trim: true, maxlength: 500 },
    subjects: { type: [String], default: [] },
    durationMinutes: { type: Number, default: 0, min: 0, max: 240 },
    engagement: { type: Number, default: 0, min: 0, max: 5 },
    homework: {
      enabled: { type: Boolean, default: false },
      title: { type: String, default: '', trim: true, maxlength: 160 },
      dueDate: { type: Date, default: null },
      assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null },
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

diaryEntrySchema.index({ schoolId: 1, date: -1, createdAt: -1 });

export const DiaryEntry = mongoose.model('DiaryEntry', diaryEntrySchema);
