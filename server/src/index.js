import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { initPresence, setUserOnline, setUserOffline, isUserOnline, getOnlineUsers } from './services/presence.js';
import { verifyAccessToken } from './utils/tokens.js';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import channelRoutes from './routes/channels.js';
import messageRoutes from './routes/messages.js';
import userRoutes from './routes/user.js';
import conversationRoutes from './routes/conversations.js';
import { Message } from './models/Message.js';
import { Workspace } from './models/Workspace.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST'],
  },
});

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));
app.use('/uploads', express.static('uploads'));

app.set('io', io);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api/', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/workspaces/:workspaceId/channels', channelRoutes);
app.use(
  '/api/workspaces/:workspaceId/channels/:channelId/messages',
  messageRoutes
);
app.use('/api/conversations', conversationRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

io.use((socket, next) => {
  try {
    const headerCookie = socket.handshake.headers?.cookie;
    const tokenFromCookie = readCookieValue(headerCookie, 'accessToken');
    const token = socket.handshake.auth?.token || tokenFromCookie;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const decoded = verifyAccessToken(token);
    socket.user = { id: decoded.sub, role: decoded.role };
    return next();
  } catch (err) {
    return next(new Error('Invalid token'));
  }
});

io.on('connection', async(socket) => {
  const userId = socket.user?.id;
  if (userId) {
    socket.join(userId.toString());
    await setUserOnline(userId, socket.id);
    const workspaces = await Workspace.find({
      'members.user': userId
    }).select('_id');
    workspaces.forEach(ws => {
      socket.join(ws._id.toString());
    });
const userIds = await getOnlineUsers();
io.emit('presence:sync', { userIds });
  }

  socket.onAny((event, ...args) => {
    console.log("Received event:", event, args);
  });

  socket.on('user:join', ({ userId }) => {
    if (!userId) return;
    socket.join(userId.toString());
  });

  socket.on('channel:join', ({ channelId }) => {
    if (!channelId) return;
    socket.join(channelId.toString());
  });

  socket.on('channel:leave', ({ channelId }) => {
    if (!channelId) return;
    socket.leave(channelId.toString());
  });

  socket.on('conversation:join', ({ conversationId }) => {
    if (!conversationId) return;
    socket.join(conversationId.toString());
  });

  socket.on('conversation:leave', ({ conversationId }) => {
    if (!conversationId) return;
    socket.leave(conversationId.toString());
  });

  socket.on('workspace:join', ({ workspaceId }) => {
    if (!workspaceId) return;
    socket.join(workspaceId.toString());
  });
  
  socket.on('typing', ({ channelId, isTyping }) => {
    if (!channelId || !userId) return;
    socket.to(channelId.toString()).emit('typing', {
      channelId: channelId.toString(),
      userId,
      isTyping: !!isTyping,
    });
  });

  socket.on('typingInConversation', ({ conversationId, isTyping }) => {
    if (!conversationId || !userId) return;
    socket.to(conversationId.toString()).emit('typingInConversation', {
      conversationId: conversationId.toString(),
      userId,
      isTyping: !!isTyping,
    });
  });


socket.on('conversation:markRead', async ({ conversationId }) => {
  if (!conversationId || !userId) return;

  try {
    await Message.updateMany(
      {
        conversation: conversationId,
        author: { $ne: userId },
        readBy: { $ne: userId }
      },
      {
        $addToSet: { readBy: userId }
      }
    );
    socket.to(conversationId.toString()).emit('conversation:readUpdate', {
      conversationId,
      readByUserId: userId
    });

  } catch (err) {
    console.error('Error marking conversation as read:', err);
  }
});

  socket.on('disconnect', () => {
    if (userId) {
      setUserOffline(userId, socket.id)
        .then(async () => {
          try {
            const stillOnline = await isUserOnline(userId);
            if (!stillOnline) {
              io.emit('presence:offline', { userId });
            }
            const userIds = await getOnlineUsers();
            io.emit('presence:sync', { userIds });
          } catch (e) {
            console.error('presence offline check error', e);
          }
        })
        .catch((e) => console.error('setUserOffline error', e));
    }
  });
});

function readCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map((p) => p.trim());
  const prefix = `${name}=`;
  const hit = parts.find((p) => p.startsWith(prefix));
  if (!hit) return null;
  const raw = hit.slice(prefix.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/realtime-collab';

async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    await initPresence(io);
    console.log('Connected to Redis and configured presence');

    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Startup error', err);
    process.exit(1);
  }
}

start();

