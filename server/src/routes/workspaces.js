import express from 'express';
import slugify from 'slugify';
import { Workspace } from '../models/Workspace.js';
import { Channel } from '../models/Channel.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { Conversation } from '../models/Conversation.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can create workspaces' });
    }
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const baseSlug = slugify(name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;
    while (await Workspace.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const workspace = await Workspace.create({
      name,
      slug,
      owner: req.user.id,
      members: [{ user: req.user.id, role: 'admin' }],
    });

    return res.status(201).json(workspace);
  } catch (err) {
    console.error('Create workspace error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const workspaces = await Workspace.find({
      'members.user': req.user.id,
    }).select('name slug members')
    .populate('members.user', 'name email');
    return res.json(workspaces);
  } catch (err) {
    console.error('List workspaces error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }
    const isGlobalAdmin = req.user.role === 'admin';
    const isWorkspaceAdmin = workspace.members.some(
      (m) => m.user._id.toString() === req.user.id && m.role === 'admin'
    );
    if (!isGlobalAdmin && !isWorkspaceAdmin && workspace.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only admins can delete workspaces' });
    }

    const channels = await Channel.find({ workspace: workspaceId }).select('_id');
    const channelIds = channels.map((c) => c._id);

    if (channelIds.length > 0) {
      await Message.deleteMany({ channel: { $in: channelIds } });
      await Channel.deleteMany({ _id: { $in: channelIds } });
    }

    await Workspace.deleteOne({ _id: workspaceId });
    return res.status(204).send();
  } catch (err) {
    console.error('Delete workspace error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:workspaceId/members', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { userId, email, role } = req.body;
    if (!userId && !email) {
      return res.status(400).json({ message: 'userId or email is required' });
    }

    const workspace = await Workspace.findById(workspaceId).select('name slug members').populate('members.user', 'name email');
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }
    const isGlobalAdmin = req.user.role === 'admin';
    const isWorkspaceAdmin = workspace.members.some(
      (m) => m.user._id.toString() === req.user.id && m.role === 'admin'
    );
    if (!isGlobalAdmin && !isWorkspaceAdmin) {
      return res.status(403).json({ message: 'Only admins can manage workspace members' });
    }
    let targetUser;
    let targetUserId = userId;
    if (!targetUserId && email) {
      targetUser = await User.findOne({ email });
      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      targetUserId = targetUser._id.toString();
    }

    const existing = workspace.members.find((m) => m.user.toString() === targetUserId);
    if (existing) {
      existing.role = role || existing.role;
    } else {
      workspace.members.push({ user: targetUserId, role: role || 'member' });
    }
    await workspace.save();
    const io = req.app.get('io');
    io.to(targetUserId).emit("workspace:memberAdded", {
      workspaceId,
      user: {
        _id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email
      },
      role: role || 'member'
    });
      io.to(workspaceId).emit("workspace:memberAdded", {
        workspaceId,
        user: {
          _id: targetUser._id,
          name: targetUser.name,
          email: targetUser.email
        },
        role: role || 'member'
      });

    return res.json(workspace);
  } catch (err) {
    console.error('Add member error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:workspaceId/members/:userId', async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const isAdmin = workspace.members.some(
      m => m.user.toString() === req.user.id && m.role === 'admin'
    );

    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admins can remove members' });
    }

    workspace.members = workspace.members.filter(
      m => m.user.toString() !== userId
    );
    await workspace.save();

    await Channel.updateMany(
      { workspace: workspaceId },
      { $pull: { members: userId } }
    );

    await Conversation.updateMany(
      { workspace: workspaceId },
      { $pull: { participants: userId } }
    );

    await Conversation.deleteMany({
      workspace: workspaceId,
      $expr: { $lte: [{ $size: "$participants" }, 1] }
    });

    const io = req.app.get('io');

    io.to(userId).emit("workspace:removed", { workspaceId });
    io.to(req.user.id).emit("workspace:memberRemoved", { workspaceId, userId });
    io.to(workspaceId).emit("workspace:memberRemoved", { workspaceId, userId });

    const updatedWorkspace = await Workspace.findById(workspaceId)
      .populate('members.user', 'name email');
    
    res.json(updatedWorkspace);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

