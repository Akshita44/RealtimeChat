import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Message } from '../models/Message.js';
import { Channel } from '../models/Channel.js';
import { Workspace } from '../models/Workspace.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router({ mergeParams: true });

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

async function ensureChannelAccess(req, res, next) {
  const { workspaceId, channelId } = req.params;
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ message: 'Workspace not found' });
  }
  const isMember = workspace.members.some((m) => m.user.toString() === req.user.id);
  if (!isMember) {
    return res.status(403).json({ message: 'Not a workspace member' });
  }

  const channel = await Channel.findById(channelId);
  if (!channel || channel.workspace.toString() !== workspaceId) {
    return res.status(404).json({ message: 'Channel not found' });
  }
  if (channel.isPrivate && !channel.members.map((m) => m.toString()).includes(req.user.id)) {
    return res.status(403).json({ message: 'Not a channel member' });
  }

  req.workspace = workspace;
  req.channel = channel;
  return next();
}

router.get('/', ensureChannelAccess, async (req, res) => {
  try {
    const { before, limit = 20, q } = req.query;
    const query = {
      channel: req.channel._id,
    };
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

    const messageIds = messages
      .filter((m) => m.author.toString() !== req.user.id)
      .map((m) => m._id);
    if (messageIds.length > 0) {
      await Message.updateMany(
        { _id: { $in: messageIds } },
        { $addToSet: { deliveredTo: req.user.id } }
      );
    }

    return res.json(messages);
  } catch (err) {
    console.error('List messages error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', ensureChannelAccess, upload.single('file'), async (req, res) => {
  try {
    const { content } = req.body;
    const file = req.file;

    if (!content && !file) {
      return res.status(400).json({ message: 'Content or file is required' });
    }

    const msg = await Message.create({
      channel: req.channel._id,
      workspace: req.workspace._id,
      author: req.user.id,
      content: content || '',
      fileUrl: file ? `/uploads/${file.filename}` : undefined,
      fileName: file ? file.originalname : undefined,
      fileType: file ? file.mimetype : undefined,
    });

    const populated = await msg.populate('author', 'name email');

    const io = req.app.get('io');
    if (io) {
      io.to(req.channel._id.toString()).emit('message:created', {
        channelId: req.channel._id.toString(),
        message: populated,
      });
    }

    return res.status(201).json(populated);
  } catch (err) {
    console.error('Create message error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/:messageId', ensureChannelAccess, async (req, res) => {
  try {
    const { messageId } = req.params;
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
      io.to(req.channel._id.toString()).emit('message:updated', {
        channelId: req.channel._id.toString(),
        message: populated,
      });
    }
    return res.json({channelId: req.channel._id.toString(), message: populated});
    // return res.json(populated);
  } catch (err) {
    console.error('Edit message error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:messageId', ensureChannelAccess, async (req, res) => {
  try {
    const { messageId } = req.params;
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
      io.to(req.channel._id.toString()).emit('message:deleted', {
        channelId: req.channel._id.toString(),
        messageId,
      });
    }
    return res.json({
      channelId: req.channel._id.toString(),
      messageId
    });
  } catch (err) {
    console.error('Delete message error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:messageId/reactions', ensureChannelAccess, async (req, res) => {
  try {
    const { messageId } = req.params;
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
      io.to(req.channel._id.toString()).emit('message:updated', {
        channelId: req.channel._id.toString(),
        message: populated,
      });
    }

    return res.json({channelId: req.channel._id.toString(), message: populated});
  } catch (err) {
    console.error('Reaction error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/read', ensureChannelAccess, async (req, res) => {
  try {
    const { upTo } = req.body;
    const cutoff = upTo ? new Date(upTo) : new Date();

    await Message.updateMany(
      {
        channel: req.channel._id,
        author: { $ne: req.user.id },
        createdAt: { $lte: cutoff },
      },
      {
        $addToSet: { readBy: req.user.id, deliveredTo: req.user.id },
      }
    );

    return res.status(204).send();
  } catch (err) {
    console.error('Mark read error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

