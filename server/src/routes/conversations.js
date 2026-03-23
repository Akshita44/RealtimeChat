import express from 'express';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { ensureSameWorkspace, requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
const router = express.Router();

router.use(requireAuth);
const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({ storage });

router.get('/', ensureSameWorkspace, async (req, res) => {
  try {
    const { workspaceId } = req.query;
    if(!workspaceId)
    {
    return res.status(400).json({ message: 'workspace is required' });
    }
    const conversations = await Conversation.find({
      workspace: workspaceId,
      participants: req.user.id,
    })
      .sort({ updatedAt: -1 })
      .populate('participants', 'name email')
      .lean();
      
    return res.json(conversations);
  } catch (err) {
    console.error('List conversations error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', ensureSameWorkspace, async (req, res) => {
  try {
    const { workspaceId, participants = [] } = req.body;

    const me = req.user.id;

    const uniqueParticipants = [...new Set([...participants, me])].sort();

    if (uniqueParticipants.length < 2) {
      return res.status(400).json({ message: "Conversation needs at least 2 users" });
    }

    let conversation = await Conversation.findOne({
      workspace: workspaceId,
      participants: { $all: uniqueParticipants },
      $expr: { $eq: [{ $size: "$participants" }, uniqueParticipants.length] }
    }).populate('participants', 'name email');

    if (!conversation) {
      conversation = await Conversation.create({
        workspace: workspaceId,
        participants: uniqueParticipants,
      });
      conversation = await conversation.populate('participants', 'name email');
    }

    const io = req.app.get('io');

    if (io) {
        io.to(workspaceId.toString()).emit("conversation:created", {
          workspaceId,
          conversation
        });
    }

    res.status(201).json(conversation);
  } catch (err) {
    console.error("Create conversation error", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post('/:conversationId/participants', ensureSameWorkspace, async (req, res) => {
  try {

    const { conversationId } = req.params;
    const { participants = [], workspaceId} = req.body;

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!conversation.workspace) {
      conversation.workspace = workspaceId;
    }

    const isParticipant = conversation.participants
      .map(id => id.toString())
      .includes(req.user.id);

    if (!isParticipant) {
      return res.status(403).json({ message: "Not part of this conversation" });
    }

    const newParticipants = participants.filter(
      id => !conversation.participants.map(p => p.toString()).includes(id)
    );

    conversation.participants.push(...newParticipants);

    await conversation.save();

    const populated = await conversation.populate(
      "participants",
      "name email"
    );

    const io = req.app.get('io');

    if (io) {
      conversation.participants.forEach((user) => {
        io.to(user._id.toString()).emit("conversation:participantsAdded", {
          workspaceId,
          conversationId: conversation._id.toString(),
          participants: populated.participants
        });
      });
    }

    return res.json(populated);

  } catch (err) {
    console.error("Add participants error", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get('/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { before, limit = 30, q} = req.query;
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    const isParticipant = conversation.participants
      .map((p) => p.toString())
      .includes(req.user.id);
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not a participant in this conversation' });
    }

    const query = { conversation: conversation._id };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
    if (q) {
      query.content = { $regex: q, $options: 'i' };
    }
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('author', 'name email')
      .lean();

    return res.json(messages);
  } catch (err) {
    console.error('List DM messages error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:conversationId/messages', upload.single('file'),async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content } = req.body;
    const file = req.file;
    if (!content && !file) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    const isParticipant = conversation.participants
      .map((p) => p.toString())
      .includes(req.user.id);
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not a participant in this conversation' });
    }

    let msg = await Message.create({
      conversation: conversation._id,
      author: req.user.id,
      content,
      fileUrl: file ? `/uploads/${file.filename}` : undefined,
      fileName: file ? file.originalname : undefined,
      fileType: file ? file.mimetype : undefined,
    });

    msg = await msg.populate('author', 'name email');

    const io = req.app.get('io');

    if (io) {
      io.to(conversationId.toString()).emit('dm:message', {
              conversationId: conversation._id.toString(),
              message: msg,
      });
    }

    return res.status(201).json(msg);
  } catch (err) {
    console.error('Create DM message error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/:conversationId/messages/:messageId', async (req, res) => {
  try {
    const { messageId , conversationId} = req.params;
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const msg = await Message.findById(messageId);
    if (!msg) {
      return res.status(404).json({ message: 'Message not found' });
    }
    if (msg.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Can only edit own messages' });
    }

    msg.editHistory.push({ content: msg.content, editedAt: new Date() });
    msg.content = content;
    await msg.save();

    const populated = await msg.populate([
      { path: 'author', select: 'name email' },
    ]);

    const io = req.app.get('io');
    if (io) {
      io.to(conversationId.toString()).emit('conversationmessage:updated', {
        conversationId,
        message: populated,
      });
    }

    return res.json({conversationId, message: populated});
  } catch (err) {
    console.error('Edit message error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:conversationId/messages/:messageId', async (req, res) => {
  try {
    const { messageId, conversationId } = req.params;
    const msg = await Message.findById(messageId);
    if (!msg) {
      return res.status(404).json({ message: 'Message not found' });
    }
    if (msg.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Can only delete own messages' });
    }

    await Message.findByIdAndDelete(messageId);
    const io = req.app.get('io');
    if (io) {
      io.to(conversationId.toString()).emit('conversationmessage:deleted', {
        conversationId,
        messageId,
      });
    }
    return res.json({
      conversationId,
      messageId
    });
    
  } catch (err) {
    console.error('Delete message error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:conversationId/messages/:messageId/reactions', async (req, res) => {
  try {
    const { messageId, conversationId} = req.params;
    const { emoji } = req.body;
    if (!emoji) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    const msg = await Message.findById(messageId);
    if (!msg) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const existing = msg.reactions.find(
      (r) => r.emoji === emoji && r.user.toString() === req.user.id
    );
    if (existing) {
      msg.reactions = msg.reactions.filter(
        (r) => !(r.emoji === emoji && r.user.toString() === req.user.id)
      );
    } else {
      msg.reactions.push({ emoji, user: req.user.id });
    }
    await msg.save();

    const populated = await msg.populate([
      { path: 'author', select: 'name email' },
    ]);

    const io = req.app.get('io');
    if (io) {
      io.to(conversationId.toString()).emit('conversationmessage:updated', {
        conversationId,
        message: populated,
      });
    }
    return res.json({conversationId, message: populated});
  } catch (err) {
    console.error('Reaction error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
export default router;

