import express from 'express';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { Workspace } from '../models/Workspace.js';

const router = express.Router();

router.use(requireAuth);

router.get('/search', async (req, res) => {
  try {
    const { q = '', workspaceId } = req.query;

    let filter = {
      _id: { $ne: req.user.id },
      $or: [
        { name: { $regex: q.trim(), $options: 'i' } },
        { email: { $regex: q.trim(), $options: 'i' } }
      ]
    };

    if (workspaceId) {
      const workspace = await Workspace.findById(workspaceId).select('members');

      if (!workspace) {
        return res.status(404).json({ message: 'Workspace not found' });
      }

      const memberIds = workspace.members.map(m => m.user);

      filter._id.$in = memberIds;
    }

    const users = await User.find(filter)
      .select('name email')
      .limit(10);

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error searching users' });
  }
});
export default router;

