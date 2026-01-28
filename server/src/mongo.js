import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectMongo() {
  if (!env.mongodbUri) {
    console.warn('MONGODB_URI not set; running without Mongo persistence.');
    return;
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongodbUri);
  console.log('MongoDB connected');
}

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

export { mongoose };
