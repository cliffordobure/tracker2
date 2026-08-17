import mongoose from 'mongoose';

const teacherNoteSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kid', required: true, index: true },
    category: {
      type: String,
      enum: ['general', 'academic', 'behaviour', 'health', 'urgent'],
      default: 'general',
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

teacherNoteSchema.index({ schoolId: 1, createdAt: -1 });

export const TeacherNote = mongoose.model('TeacherNote', teacherNoteSchema);
