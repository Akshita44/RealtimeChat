import { verifyAccessToken } from '../utils/tokens.js';
import { User } from '../models/User.js';
import { Workspace } from "../models/Workspace.js";

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };
    next();
  } catch (err) {
    console.error('Auth error', err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

export const ensureSameWorkspace = async (req, res, next) => {
  try {

    var { workspaceId, participants = [] } = req.body;

    if (!workspaceId) {
      workspaceId = req.query?.workspaceId;
    }

    if (!workspaceId) {
      return res.status(400).json({ message: "workspaceId is required" });
    }
    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const memberIds = workspace.members.map(m => m.user.toString());

    if (!memberIds.includes(req.user.id)) {
      return res.status(403).json({
        message: "You are not a member of this workspace"
      });
    }

    const invalidUsers = participants.filter(
      id => !memberIds.includes(id)
    );

    if (invalidUsers.length > 0) {
      return res.status(403).json({
        message: "All participants must belong to the workspace"
      });
    }

    next();

  } catch (err) {
    console.error("Workspace check error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
