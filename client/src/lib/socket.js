import { io } from 'socket.io-client';
import { store } from '../store.js';
import {
  addMessage,
  updateMessage,
  removeMessage,
  setTyping,
  setUserOnline,
  setUserOffline,
  addChannel,
  removeChannel,
  channelMemberAdded,
  fetchChannels,
  setOnlineUsersBulk
} from '../features/chatSlice.js';
import { fetchWorkspaces, setCurrentWorkspace} from '../features/workspaceSlice.js';
import { addDmMessage, setTypingInConversation, conversationCreated, participantsAdded, fetchConversations, updateDmMessage
  ,deleteDmMessage
 } from '../features/dmSlice.js';

let socket = null;
let isConnecting = false;

export function initSocket() {
  const token = store.getState().auth.accessToken;
  if (!token) return null;
  if (socket && socket.connected) return socket;

  if (socket && !socket.connected) {
    socket.disconnect();
    socket = null;
  }

  if (isConnecting) return socket;

  isConnecting = true;
  const url = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
  socket = io(url, {
    auth: { token },
    withCredentials: true,
    transports: ["websocket"]
  });

  socket.on('connect', () => {
    console.log("socket connected");
    isConnecting = false;
  });

  socket.on('disconnect', () => {
    console.log("socket disconnected");
    socket = null;
  });

  socket.on('connect_error', () => {
    socket?.disconnect();
    socket = null;
    isConnecting = false;
    window.location.href = '/login';
  });

  socket.on('presence:online', ({ userId }) => {
    store.dispatch(setUserOnline(userId));
  });

  socket.on('presence:offline', ({ userId }) => {
    store.dispatch(setUserOffline(userId));
  });

  socket.on('presence:sync', ({ userIds }) => {
    if (!Array.isArray(userIds)) return;
    const map = {};
    userIds.forEach(id => {
      if (id) map[id] = true;
    });

    store.dispatch(setOnlineUsersBulk(map));
  });

  socket.on('message:created', ({ channelId, message }) => {
    store.dispatch(addMessage({ channelId, message }));
  });

  socket.on('message:updated', ({ channelId, message }) => {
    store.dispatch(updateMessage({ channelId, message }));
  });

  socket.on('message:deleted', ({ channelId, messageId }) => {
    store.dispatch(removeMessage({ channelId, messageId }));
  });

  socket.on('typing', ({ channelId, userId, isTyping }) => {
    store.dispatch(setTyping({ channelId, userId, isTyping }));
  });

  socket.on('typingInConversation', ({ conversationId, userId, isTyping }) => {
    store.dispatch(setTypingInConversation({ conversationId, userId, isTyping }));
  });

  socket.on('dm:message', ({ conversationId, message }) => {
    store.dispatch(addDmMessage({ conversationId, message }));
  });
  socket.on('conversationmessage:updated', ({ conversationId, message }) => {
    store.dispatch(updateDmMessage({ conversationId, message }));
  });
  socket.on('conversationmessage:deleted', ({ conversationId, messageId }) => {
    store.dispatch(deleteDmMessage({ conversationId, messageId }));
  });

  socket.on("workspace:removed", ({ workspaceId }) => {
    const state = store.getState();
    const currentWorkspaceId = state.workspaces.currentId;
  
    if (workspaceId === currentWorkspaceId) {
      store.dispatch(setCurrentWorkspace(null));
    }
    store.dispatch(fetchWorkspaces());
  });

  socket.on("workspace:memberRemoved", ({ workspaceId, userId }) => {
    const state = store.getState();
    const currentWorkspaceId = state.workspaces.currentId;
  
    if (workspaceId !== currentWorkspaceId) return;
    store.dispatch(fetchWorkspaces());
    store.dispatch(fetchChannels(workspaceId));
    store.dispatch(fetchConversations(workspaceId));
  });

  socket.on("conversation:participantsAdded", ({ conversationId, participants, workspaceId }) => {
    const state = store.getState();
    const exists = state.dm.conversations.some(c => c._id === conversationId);
  
    if (exists) {
      store.dispatch(participantsAdded({ conversationId, participants }));
    } else {
      store.dispatch(fetchConversations(workspaceId));
    }
  });
  
  socket.on("conversation:created", ({ conversation, workspaceId }) => {
    store.dispatch(conversationCreated(conversation));
  });
  
  socket.on('channel:memberAdded', ({ workspaceId, channelId, member }) => {
    const state = store.getState();
    const currentWorkspaceId = state.workspaces.currentId;
    const currentUserId = state.auth.user?.id;
    
    if (workspaceId !== currentWorkspaceId) return;
    if (member._id === currentUserId) {
      store.dispatch(fetchChannels(workspaceId));
      return;
    }
    store.dispatch(channelMemberAdded({ channelId, member }));
  });

  socket.on("workspace:memberAdded", ({ workspaceId, user, role }) => {
    store.dispatch(fetchWorkspaces());
  });  
  
  socket.on("channel:created", ({ workspaceId, channel}) => {
    const state = store.getState();
    const currentWorkspaceId = state.workspaces.currentId;
  
    if (workspaceId === currentWorkspaceId) {
    store.dispatch(addChannel(channel));
    }
  });
  
  socket.on("channel:deleted", ({ workspaceId, channelId }) => {
    const state = store.getState();
    const currentWorkspaceId = state.workspaces.currentId;
  
    if (workspaceId === currentWorkspaceId) {
      store.dispatch(removeChannel(channelId));
    }
  }); 
  
  return socket;
}

export function getSocket() {
  if (socket) return socket;

  const token = store.getState().auth.accessToken;
  if (!token) return null;

  return initSocket();
}

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
