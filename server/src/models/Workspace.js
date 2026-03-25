import mongoose from 'mongoose';

const { Schema } = mongoose;

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true},
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        role: {
          type: String,
          enum: ['admin', 'member'],
          default: 'member',
        },
      },
    ],
  },
  { timestamps: true }
);

export const Workspace = mongoose.model('Workspace', workspaceSchema);

