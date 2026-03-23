import mongoose from 'mongoose';

const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
  },
  { timestamps: true }
);

conversationSchema.pre('save', function preSave(next) {
  if (Array.isArray(this.participants)) {
    this.participants = this.participants
      .map((id) => id.toString())
      .sort()
      .map((id) => new mongoose.Types.ObjectId(id));
  }
  next();
});

conversationSchema.index({
  workspace: 1,
  participants: 1
});

export const Conversation = mongoose.model('Conversation', conversationSchema);

