import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'driver', 'parent', 'teacher'], required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '' },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
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
    active: this.active,
  };
};

export const User = mongoose.model('User', userSchema);
