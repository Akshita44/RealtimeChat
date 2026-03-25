import express from 'express';
import { Channel } from '../models/Channel.js';
import { Workspace } from '../models/Workspace.js';
import { User } from '../models/User.js';
import { Message } from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

async function ensureWorkspaceMember(req, res, next) {
  const { workspaceId } = req.params;
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ message: 'Workspace not found' });
  }
  const isMember = workspace.members.some((m) => m.user.toString() === req.user.id);
  if (!isMember) {
    return res.status(403).json({ message: 'Not a workspace member' });
  }
  req.workspace = workspace;
  return next();
}

async function ensureWorkspaceAdmin(req, res, next) {
  const { workspaceId } = req.params;
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return res.status(404).json({ message: 'Workspace not found' });
  }
  const isGlobalAdmin = req.user.role === 'admin';
  const isWorkspaceAdmin = workspace.members.some(
    (m) => m.user.toString() === req.user.id && m.role === 'admin'
  );
  if (!isGlobalAdmin && !isWorkspaceAdmin) {
    return res.status(403).json({ message: 'Only admins can manage channels' });
  }
  req.workspace = workspace;
  return next();
}

router.post('/', ensureWorkspaceAdmin, async (req, res) => {
  try {
    const { name, isPrivate } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Channel name is required' });
    }

    const trimmedName = name.trim();

    const existing = await Channel.findOne({
      workspace: req.workspace._id,
      name: { $regex: `^${trimmedName}$`, $options: 'i' },
    });

    if (existing) {
      return res.status(400).json({
        message: 'Channel with this name already exists in the workspace',
      });
    }
    
    const channel = await Channel.create({
      name,
      workspace: req.workspace._id,
      isPrivate: !!isPrivate,
      members: isPrivate ? [req.user.id] : [],
    });

    const io = req.app.get('io');
    if (io) {
        io.to(req.workspace._id.toString()).emit("channel:created", {
          workspaceId: req.workspace._id,
          channel
        });
    }
    return res.status(201).json(channel);
  } catch (err) {
    console.error('Create channel error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/', ensureWorkspaceMember, async (req, res) => {
  try {
    const userId = req.user.id;

    const channels = await Channel.find({
      workspace: req.workspace._id,
      $or: [
        { isPrivate: false },
        { members: userId } 
      ]
    }).sort({ createdAt: 1 })
    .populate('members', 'name email');

    return res.json(channels);
  } catch (err) {
    console.error('List channels error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:channelId', ensureWorkspaceAdmin, async (req, res) => {
  try {
    const { channelId } = req.params;
    const channel = await Channel.findById(channelId);
    if (!channel || channel.workspace.toString() !== req.workspace._id.toString()) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    const io = req.app.get('io');
    if (io) {
        io.to(req.workspace._id.toString()).emit("channel:deleted", {
          workspaceId: req.workspace._id,
          channelId
        });
    }
    await Message.deleteMany({ channel: channelId });
    await Channel.deleteOne({ _id: channelId });
    return res.status(204).send();
  } catch (err) {
    console.error('Delete channel error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:channelId/members', ensureWorkspaceAdmin, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { userId, email } = req.body;

    if (!userId && !email) {
      return res.status(400).json({ message: 'userId or email is required' });
    }

    const channel = await Channel.findById(channelId);
    if (!channel || channel.workspace.toString() !== req.workspace._id.toString()) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    let targetUser;
    if (userId) {
      targetUser = await User.findById(userId);
    } else {
      targetUser = await User.findOne({ email });
    }

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const targetUserId = targetUser._id.toString();

    const isWorkspaceMember = req.workspace.members.some(
      (m) => m.user.toString() === targetUserId
    );

    if (!isWorkspaceMember) {
      return res.status(400).json({
        message: 'User is not a member of this workspace',
      });
    }

    if (!channel.members.map((m) => m.toString()).includes(targetUserId)) {
      channel.members.push(targetUserId);
      await channel.save();
    }

    const io = req.app.get('io');
    if (io) {
      io.to(req.workspace._id.toString()).emit('channel:memberAdded', {
        workspaceId: req.workspace._id.toString(),
        channelId: channel._id.toString(),
        member: targetUser,
      });
    }

    return res.json({
      channelId: channel._id,
      member: {
        _id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
      }
    });

  } catch (err) {
    console.error('Add channel member error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

