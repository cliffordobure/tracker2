import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['super_admin', 'school_admin', 'driver', 'parent', 'teacher'],
      required: true,
    },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '' },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    photoUrl: { type: String, default: '' },
    photoPublicId: { type: String, default: '' },
    aboutMe: { type: String, default: '', trim: true, maxlength: 800 },
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: ['', 'female', 'male', 'other'], default: '' },
    nationality: { type: String, default: '', trim: true },
    idNumber: { type: String, default: '', trim: true },
    yearsOfService: { type: Number, default: 0, min: 0, max: 60 },
    jobTitle: { type: String, default: 'Class Teacher', trim: true },
    twoFactorEnabled: { type: Boolean, default: false },
    language: { type: String, default: 'English', trim: true },
    theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    email: this.email,
    role: this.role,
    name: this.name,
    phone: this.phone,
    schoolId: this.schoolId?.toString?.() || this.schoolId || null,
    photoUrl: this.photoUrl || '',
    aboutMe: this.aboutMe || '',
    dateOfBirth: this.dateOfBirth || null,
    gender: this.gender || '',
    nationality: this.nationality || '',
    idNumber: this.idNumber || '',
    yearsOfService: this.yearsOfService || 0,
    jobTitle: this.jobTitle || 'Class Teacher',
    twoFactorEnabled: this.twoFactorEnabled === true,
    language: this.language || 'English',
    theme: this.theme || 'system',
    active: this.active,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
