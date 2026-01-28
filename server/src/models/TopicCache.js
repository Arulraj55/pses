import mongoose from 'mongoose';

const TopicCacheSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, index: true },
    topic: { type: String, index: true },
    language: { type: String, index: true },

    // Cached payloads
    youtube: { type: Object },
    quiz: { type: Object },
    images: { type: Object },

    // TTL
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }
  },
  { timestamps: true }
);

export const TopicCache =
  mongoose.models.TopicCache ?? mongoose.model('TopicCache', TopicCacheSchema);
