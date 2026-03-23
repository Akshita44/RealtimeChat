import mongoose from 'mongoose';

const { Schema } = mongoose;

const reactionSchema = new Schema(
  {
    emoji: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false }
);

const editHistorySchema = new Schema(
  {
    content: { type: String, required: true },
    editedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    channel: {
      type: Schema.Types.ObjectId,
      ref: 'Channel',
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: { type: String, trim: true },
    fileUrl: { type: String },
    fileName: { type: String },
    fileType: { type: String },
    reactions: [reactionSchema],
    editHistory: [editHistorySchema],
    deletedAt: { type: Date },
    deliveredTo: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

messageSchema.pre('validate', function preValidate(next) {
  const hasChannel = !!this.channel;
  const hasWorkspace = !!this.workspace;
  const hasConversation = !!this.conversation;

  if (hasConversation && (hasChannel || hasWorkspace)) {
    return next(
      new Error('Message cannot belong to both a channel/workspace and a conversation')
    );
  }

  if (!hasConversation && !(hasChannel && hasWorkspace)) {
    return next(
      new Error('Message must belong to either (channel + workspace) or a conversation')
    );
  }

  return next();
});

export const Message = mongoose.model('Message', messageSchema);

