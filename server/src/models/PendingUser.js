import { mongoose } from '../mongo.js';

const PendingUserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, default: null },
    preferredLanguage: { type: String, default: null },
    spokenLanguage: { type: String, default: null },
    spokenLanguageSecondary: { type: String, default: null },
    verified: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const PendingUser = mongoose.models.PendingUser || mongoose.model('PendingUser', PendingUserSchema);
