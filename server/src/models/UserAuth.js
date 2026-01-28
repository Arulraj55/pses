import { mongoose } from '../mongo.js';

const UserAuthSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, default: null },
    providers: { type: [String], default: [] }, // e.g. ['password','google.com','phone']
    email: { type: String, default: null },
    phoneNumber: { type: String, default: null },
    verified: { type: Boolean, default: false },

    resetTokenHash: { type: String, default: null },
    resetTokenExpiresAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const UserAuth = mongoose.models.UserAuth || mongoose.model('UserAuth', UserAuthSchema);
