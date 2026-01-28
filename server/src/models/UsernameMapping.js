import { mongoose } from '../mongo.js';

const UsernameMappingSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    uid: { type: String, required: true, index: true },
    email: { type: String, default: null },
    provider: { type: String, default: null }
  },
  { timestamps: true }
);

export const UsernameMapping = mongoose.models.UsernameMapping || mongoose.model('UsernameMapping', UsernameMappingSchema);
