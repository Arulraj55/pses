import { mongoose } from '../mongo.js';

const UserProfileSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, unique: true, index: true },
    email: { type: String, default: null },
    username: { type: String, default: null },
    preferredLanguage: { type: String, default: null },
    spokenLanguage: { type: String, default: null },
    spokenLanguageSecondary: { type: String, default: null },
    verified: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const UserProfile = mongoose.models.UserProfile || mongoose.model('UserProfile', UserProfileSchema);
