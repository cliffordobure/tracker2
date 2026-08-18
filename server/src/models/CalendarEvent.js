import mongoose from 'mongoose';

const calendarEventSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    kidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kid', default: null, index: true },
    grade: { type: String, default: '', trim: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, default: '', trim: true, maxlength: 1000 },
    category: {
      type: String,
      enum: ['academic', 'event', 'holiday', 'meeting'],
      default: 'event',
      index: true,
    },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, default: null },
    allDay: { type: Boolean, default: false },
    sourceKey: { type: String, default: '', index: true },
    venue: { type: String, default: '', trim: true, maxlength: 160 },
    organizedBy: { type: String, default: '', trim: true, maxlength: 120 },
    eventType: { type: String, default: '', trim: true, maxlength: 40 },
    eventKind: { type: String, default: '', trim: true, maxlength: 40 },
    openTo: { type: String, default: '', trim: true, maxlength: 80 },
    highlights: { type: [String], default: [] },
    schedule: {
      type: [
        {
          time: { type: String, default: '', trim: true, maxlength: 24 },
          title: { type: String, default: '', trim: true, maxlength: 120 },
        },
      ],
      default: [],
    },
    importantNotes: { type: [String], default: [] },
    defaultActivities: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

calendarEventSchema.index({ schoolId: 1, startAt: 1 });
calendarEventSchema.index(
  { schoolId: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $gt: '' } } }
);

export const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);
