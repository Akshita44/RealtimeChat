import mongoose from 'mongoose';

const { Schema } = mongoose;

const channelSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    isPrivate: { type: Boolean, default: false },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { timestamps: true }
);

export const Channel = mongoose.model('Channel', channelSchema);

