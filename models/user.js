import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  fullName: String,
  username: { type: String, required: false, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['pending', 'active'], default: 'pending' },
  isActive: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('User', userSchema);
