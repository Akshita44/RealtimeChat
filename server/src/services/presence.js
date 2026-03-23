import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

let redisClient;
let pubClient;
let subClient;

export async function initPresence(io) {
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  redisClient = createClient({ url });
  pubClient = createClient({ url });
  subClient = createClient({ url });

  redisClient.on('error', (err) => console.error('Redis error', err));
  pubClient.on('error', (err) => console.error('Redis pub error', err));
  subClient.on('error', (err) => console.error('Redis sub error', err));

  await Promise.all([
    redisClient.connect(),
    pubClient.connect(),
    subClient.connect()
  ]);

  io.adapter(createAdapter(pubClient, subClient));
}

export async function setUserOnline(userId, socketId) {
  if (!redisClient) return;

  await redisClient.sAdd(`user:${userId}:sockets`, socketId);
  await redisClient.sAdd('onlineUsers', userId);
}

export async function setUserOffline(userId, socketId) {
  if (!redisClient) return false;

  const key = `user:${userId}:sockets`;

  await redisClient.sRem(key, socketId);

  const remaining = await redisClient.sCard(key);

  if (remaining === 0) {
    await redisClient.del(key);
    await redisClient.sRem('onlineUsers', userId);
    return true;
  }

  return false;
}

export async function isUserOnline(userId) {
  if (!redisClient) return false;
  return (await redisClient.sCard(`user:${userId}:sockets`)) > 0;
}

export async function getOnlineUsers() {
  if (!redisClient) return [];
  return await redisClient.sMembers('onlineUsers');
}
