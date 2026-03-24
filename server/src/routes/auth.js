import express from 'express';
import { User } from '../models/User.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function setAuthCookies(res, accessToken, refreshToken) {
  const common = {
    httpOnly: true,
    sameSite: 'none',  
    secure: true,
  };

  res.cookie('accessToken', accessToken, { ...common, maxAge: 15 * 60 * 1000 });
  res.cookie('refreshToken', refreshToken, { ...common, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: 'member',
    });

    const payload = { sub: user._id.toString(), role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    setAuthCookies(res, accessToken, refreshToken);

    return res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      accessToken,
    });
  } catch (err) {
    console.error('Register error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const payload = { sub: user._id.toString(), role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    setAuthCookies(res, accessToken, refreshToken);

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      accessToken,
    });
  } catch (err) {
    console.error('Login error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies && req.cookies.refreshToken;
    if (!token) {
      return res.status(401).json({ message: 'Refresh token missing' });
    }

    const decoded = verifyRefreshToken(token);
    const payload = { sub: decoded.sub, role: decoded.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    setAuthCookies(res, accessToken, refreshToken);

    return res.json({ accessToken });
  } catch (err) {
    console.error('Refresh error', err);
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  return res.status(204).send();
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.user, accessToken: req.cookies.accessToken });
});

export default router;

