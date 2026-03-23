import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../lib/api.js';

const initialState = {
  channels: [],
  currentChannelId: null,
  messagesByChannel: {}, // channelId -> { items: [], hasMore, beforeCursor }
  typing: {}, // channelId -> { [userId]: true }
  onlineUsers: {}, // userId -> true
  usersById: {}, // userId -> { _id, name, email }
};

export const fetchChannels = createAsyncThunk(
  'chat/fetchChannels',
  async (workspaceId, { rejectWithValue }) => {
    try {
      const res = await api.get(`/workspaces/${workspaceId}/channels`);
      return { workspaceId, channels: res.data };
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to load channels' });
    }
  }
);

export const createChannel = createAsyncThunk(
  'chat/createChannel',
  async ({ workspaceId, name, isPrivate }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/workspaces/${workspaceId}/channels`, { name, isPrivate });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to create channel' });
    }
  }
);

export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async ({ workspaceId, channelId, before, q }, { rejectWithValue }) => {
    try {
      const params = { limit: 21 };
      if (before) params.before = before;
      if (q) params.q = q;
      const res = await api.get(`/workspaces/${workspaceId}/channels/${channelId}/messages`, {
        params,
      });
      return { channelId, messages: res.data, replace: !!q && !before };
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to load messages' });
    }
  }
);

export const deleteChannel = createAsyncThunk(
  'chat/deleteChannel',
  async ({ workspaceId, channelId }, { rejectWithValue }) => {
    try {
      await api.delete(`/workspaces/${workspaceId}/channels/${channelId}`);
      return { channelId };
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to delete channel' });
    }
  }
);

export const addChannelMember = createAsyncThunk(
  'chat/addChannelMember',
  async ({ workspaceId, channelId, email }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/workspaces/${workspaceId}/channels/${channelId}/members`, {
        email,
      });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to add channel member' });
    }
  }
);

export const toggleReaction = createAsyncThunk(
  'chat/toggleReaction',
  async ({ workspaceId, channelId, messageId, emoji }, { rejectWithValue }) => {
    try {
      const res = await api.post(
        `/workspaces/${workspaceId}/channels/${channelId}/messages/${messageId}/reactions`,
        { emoji }
      );
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Reaction failed' });
    }
  }
);

export const editMessage = createAsyncThunk(
  'chat/editMessage',
  async ({ workspaceId, channelId, messageId, content }, { rejectWithValue }) => {
    try {
      const res = await api.patch(
        `/workspaces/${workspaceId}/channels/${channelId}/messages/${messageId}`,
        { content }
      );
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to edit message' });
    }
  }
);

export const deleteMessage = createAsyncThunk(
  'chat/deleteMessage',
  async ({ workspaceId, channelId, messageId }, { rejectWithValue }) => {
    try {
      await api.delete(`/workspaces/${workspaceId}/channels/${channelId}/messages/${messageId}`);
      return { channelId, messageId };
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to delete message' });
    }
  }
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setCurrentChannel(state, action) {
      state.currentChannelId = action.payload;
    },
    clearChannels(state) {
      state.channels =[];
      state.currentChannelId = null;
    },
    clearAllOnlineUsers(state){
      state.onlineUsers= {};
    },
    addChannel(state, action)
    {
      const exists = state.channels.some(c => c._id === action.payload._id);
      if (!exists) {
        state.channels.push(action.payload);
      }
    },
    channelMemberAdded(state, action) {
      const { channelId, member } = action.payload;
    
      const channel = state.channels.find(c => c._id === channelId);
      if (!channel) return;
    
      if (!channel.members) channel.members = [];
    
      const exists = channel.members.some(m => m._id === member._id);
      if (!exists) {
        channel.members.push(member);
      }
    },
    removeChannel(state, action)
    {
      const channelId = action.payload;
        state.channels = state.channels.filter((c) => c._id !== channelId);
        if (state.currentChannelId === channelId) {
          state.currentChannelId = state.channels.length ? state.channels[0]._id : null;
        }
    },
    addMessage(state, action) {
      const { channelId, message } = action.payload;
      if (!state.messagesByChannel[channelId]) {
        state.messagesByChannel[channelId] = { items: [], hasMore: true, beforeCursor: null };
      }
      if (message?.author?._id) {
        state.usersById[message.author._id] = message.author;
      }
      const bucket = state.messagesByChannel[channelId];
      const exists = bucket.items.some((m) => m._id === message._id);
      if (!exists) {
        bucket.items.unshift(message);
      }      
    },
    updateMessage(state, action) {
      const { channelId, message } = action.payload;
      if (message?.author?._id) {
        state.usersById[message.author._id] = message.author;
      }
      const bucket = state.messagesByChannel[channelId];
      if (!bucket) return;
      const idx = bucket.items.findIndex((m) => m._id === message._id);
      if (idx >= 0) bucket.items[idx] = message;
    },
    removeMessage(state, action) {
      const { channelId, messageId } = action.payload;
      const bucket = state.messagesByChannel[channelId];
      if (!bucket) return;
      bucket.items = bucket.items.filter((m) => m._id !== messageId);
    },
    setTyping(state, action) {
      const { channelId, userId, isTyping } = action.payload;
      if (!state.typing[channelId]) state.typing[channelId] = {};
      if (isTyping) state.typing[channelId][userId] = true;
      else delete state.typing[channelId][userId];
    },
    setUserOnline(state, action) {
      state.onlineUsers[action.payload] = true;      
    },
    setOnlineUsersBulk(state, action) {
      state.onlineUsers = action.payload;
    },
    setUserOffline(state, action) {
      const userId = action.payload;
      delete state.onlineUsers[userId];
      Object.keys(state.typing).forEach((chId) => {
        if (state.typing[chId]?.[userId]) {
          delete state.typing[chId][userId];
        }
      });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchChannels.fulfilled, (state, action) => {
        state.channels = action.payload.channels;
        if (!state.currentChannelId && action.payload.channels.length > 0) {
          state.currentChannelId = action.payload.channels[0]._id;
        }
      })
      .addCase(createChannel.fulfilled, (state, action) => {
        const exists = state.channels.some(c => c._id === action.payload._id);
        if (!exists) {
          state.channels.push(action.payload);
        state.currentChannelId = action.payload._id;
        }
      })
      .addCase(addChannelMember.fulfilled, (state, action) => {
        const { channelId, member } = action.payload;
    
      const channel = state.channels.find(c => c._id === channelId);
      if (!channel) return;
      if (!channel.members) channel.members = [];
      const exists = channel.members.some(m => m._id === member._id);
      if (!exists) {
        channel.members.push(member);
      }
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        const { channelId, messages, replace } = action.payload;
        const limit = 20;
        if (!state.messagesByChannel[channelId]) {
          state.messagesByChannel[channelId] = { items: [], hasMore: true, beforeCursor: null };
        }
        messages.forEach((m) => {
          if (m?.author?._id) {
            state.usersById[m.author._id] = m.author;
          }
        });
        const bucket = state.messagesByChannel[channelId];
        if (replace) {
          bucket.items = messages;
        } else {
          const existingIds = new Set(bucket.items.map((m) => m._id));
          const merged = [...bucket.items];
          messages.forEach((m) => {
            if (!existingIds.has(m._id)) merged.push(m);
          });
          bucket.items = merged;
        }
        bucket.hasMore = messages.length > limit;
        if (messages.length > 0) {
          bucket.beforeCursor = messages[messages.length - 1].createdAt;
        }
      })
      .addCase(deleteChannel.fulfilled, (state, action) => {
        const { channelId } = action.payload;
        state.channels = state.channels.filter((c) => c._id !== channelId);
        if (state.currentChannelId === channelId) {
          state.currentChannelId = state.channels.length ? state.channels[0]._id : null;
        }
      })
      .addCase(toggleReaction.fulfilled, (state, action) => {
  const { channelId, message } = action.payload;
  const bucket = state.messagesByChannel[channelId];
  if (!bucket) return;
  const idx = bucket.items.findIndex((m) => m._id === message._id);
  if (idx >= 0) bucket.items[idx] = {...message};
})
.addCase(editMessage.fulfilled, (state, action) => {
  const { channelId, message } = action.payload;
  const bucket = state.messagesByChannel[channelId];
  if (!bucket) return;
  const idx = bucket.items.findIndex((m) => m._id === message._id);
  if (idx >= 0) bucket.items[idx] = message;
})
.addCase(deleteMessage.fulfilled, (state, action) => {
  const { channelId, messageId } = action.payload;
  const bucket = state.messagesByChannel[channelId];
  if (!bucket) return;
  bucket.items = bucket.items.filter((m) => m._id !== messageId);
})
  },
});

export const {
  setCurrentChannel,
  addMessage,
  updateMessage,
  removeMessage,
  setTyping,
  setUserOnline,
  setUserOffline,
  clearChannels,
  addChannel,
  removeChannel,
  channelMemberAdded,
  clearAllOnlineUsers,
  setOnlineUsersBulk
} = chatSlice.actions;

export default chatSlice.reducer;

