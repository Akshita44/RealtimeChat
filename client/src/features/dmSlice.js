import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../lib/api.js';

const initialState = {
  conversations: [],
  currentConversationId: null,
  messagesByConversation: {}, // conversationId -> { items: [], hasMore, beforeCursor }
  status: 'idle',
  error: null,
  typing: {},
};

export const fetchConversations = createAsyncThunk(
  'dm/fetchConversations',
  async (workspaceId, { rejectWithValue }) => {
    try {
      const res = await api.get('/conversations', {
        params: {
          workspaceId
        }
      });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to load conversations' });
    }
  }
);

export const openConversation = createAsyncThunk(
  'dm/openConversation',
  async ({ participants, workspaceId }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/conversations/`,{workspaceId, participants});
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to open conversation' });
    }
  }
);

export const addMemberToConversation = createAsyncThunk(
  'dm/addMemberToConversation',
  async ({ participants, conversationId, workspaceId}, { rejectWithValue }) => {
    try {
      const res = await api.post(`/conversations/${conversationId}/participants`,{participants, workspaceId});
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to open conversation' });
    }
  }
);

export const fetchConversationMessages = createAsyncThunk(
  'dm/fetchConversationMessages',
  async ({ conversationId, before, q }, { rejectWithValue }) => {
    try {
      const params = {};
      if (before) params.before = before;
      if (q) params.q = q;
      const res = await api.get(`/conversations/${conversationId}/messages`, { params });
      return { conversationId, messages: res.data, replace: !!q && !before };
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to load DM messages' });
    }
  }
);

export const sendDirectMessage = createAsyncThunk(
  'dm/sendDirectMessage',
  async ({ conversationId, formData }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/conversations/${conversationId}/messages`, formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return { conversationId, message: res.data };
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to send DM' });
    }
  }
);

export const toggleReaction = createAsyncThunk(
  'dm/toggleReaction',
  async ({messageId, conversationId, emoji }, { rejectWithValue }) => {
    try {
      const res = await api.post(
        `/conversations/${conversationId}/messages/${messageId}/reactions`,
        { emoji }
      );
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Reaction failed' });
    }
  }
);

export const editMessage = createAsyncThunk(
  'dm/editMessage',
  async ({ messageId, conversationId, content }, { rejectWithValue }) => {
    try {
      const res = await api.patch(
        `/conversations/${conversationId}/messages/${messageId}`,
        { content }
      );
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to edit message' });
    }
  }
);

export const deleteMessage = createAsyncThunk(
  'dm/deleteMessage',
  async ({ messageId, conversationId}, { rejectWithValue }) => {
    try {
      const res = await api.delete(`/conversations/${conversationId}/messages/${messageId}`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to delete message' });
    }
  }
);

const dmSlice = createSlice({
  name: 'dm',
  initialState,
  reducers: {
    setCurrentConversationId(state, action) {
      state.currentConversationId = action.payload;
    },
    clearConversations(state) {
      state.conversations =[];
      state.currentConversationId = null;
    },
    setTypingInConversation(state, action) {
      const { conversationId, userId, isTyping } = action.payload;
      if (!state.typing[conversationId]) state.typing[conversationId] = {};
      if (isTyping) state.typing[conversationId][userId] = true;
      else delete state.typing[conversationId][userId];
    },
markConversationAsReadLocally(state, action) {
  const { conversationId, userId } = action.payload;
  const bucket = state.messagesByConversation[conversationId];
  if (bucket && bucket.items) {
    bucket.items = bucket.items.map(msg => {
      if (msg.author !== userId && !msg.readBy.includes(userId)) {
        return { ...msg, readBy: [...msg.readBy, userId] };
      }
      return msg;
    });
  }
},
    addDmMessage(state, action) {
      const { conversationId, message } = action.payload;
      if (!state.messagesByConversation[conversationId]) {
        state.messagesByConversation[conversationId] = {
          items: [],
          hasMore: true,
          beforeCursor: null,
        };
      }
      const bucket = state.messagesByConversation[conversationId];
      const exists = bucket.items.some((m) => m._id === message._id);
      if (!exists) {
        bucket.items.unshift(message);
      }
    },
    updateDmMessage(state, action) {
      const { conversationId, message } = action.payload;
      const bucket = state.messagesByConversation[conversationId];
      if (!bucket) return;
      const idx = bucket.items.findIndex((m) => m._id === message._id);
      if (idx >= 0) bucket.items[idx] = message;
    },
    deleteDmMessage(state, action) {
      const { conversationId, messageId} = action.payload;
      const bucket = state.messagesByConversation[conversationId];
      if (!bucket) return;
      bucket.items = bucket.items.filter((m) => m._id !== messageId);
    },
    conversationCreated(state, action) {
      const conv = action.payload;
      const index = state.conversations.findIndex(
        (c) => c._id === conv._id
      );
    
      if (index !== -1) {
        state.conversations[index] = conv;
      } else {
        state.conversations.unshift(conv);
      }
    },
    participantsAdded(state, action) {
      const { conversationId, participants } = action.payload;
    
      const index = state.conversations.findIndex(
        (c) => c._id === conversationId
      );
    
      if (index !== -1) {
        state.conversations[index] = {
          ...state.conversations[index],
          participants
        };
      }
    }        
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.conversations = action.payload;
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload?.message || 'Failed to load conversations';
      })
      .addCase(addMemberToConversation.fulfilled, (state, action) => {
        const updatedConv = action.payload;
      
        const index = state.conversations.findIndex(
          (c) => c._id === updatedConv._id
        );
      
        if (index !== -1) {
          state.conversations[index] = updatedConv;
        }
      })
      .addCase(openConversation.fulfilled, (state, action) => {
        const conv = action.payload;
      
        const index = state.conversations.findIndex(
          c => c._id === conv._id
        );
      
        if (index !== -1) {
          state.conversations[index] = conv;
        } else {
          state.conversations.unshift(conv);
        }
      
        state.currentConversationId = conv._id;
      })
      .addCase(fetchConversationMessages.fulfilled, (state, action) => {
        const { conversationId, messages, before } = action.payload;
        const limit = 20;
        if (!state.messagesByConversation[conversationId]) {
          state.messagesByConversation[conversationId] = {
            items: [],
            hasMore: true,
            beforeCursor: null,
          };
        }
        const bucket = state.messagesByConversation[conversationId];
        if (!before) {
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
      .addCase(sendDirectMessage.fulfilled, (state, action) => {
        const { conversationId, message } = action.payload;
        if (!state.messagesByConversation[conversationId]) {
          state.messagesByConversation[conversationId] = {
            items: [],
            hasMore: true,
            beforeCursor: null,
          };
        }
        const bucket = state.messagesByConversation[conversationId];
        const exists = bucket.items.some((m) => m._id === message._id);
        if (!exists) {
          bucket.items.unshift(message);
        }
      })
      .addCase(toggleReaction.fulfilled, (state, action) => {
        const { conversationId, message } = action.payload;
        const bucket = state.messagesByConversation[conversationId];
        if (!bucket) return;
        const idx = bucket.items.findIndex((m) => m._id === message._id);
        if (idx >= 0) bucket.items[idx] = message;
      })
      .addCase(editMessage.fulfilled, (state, action) => {
        const { conversationId, message } = action.payload;
        const bucket = state.messagesByConversation[conversationId];
        if (!bucket) return;
        const idx = bucket.items.findIndex((m) => m._id === message._id);
        if (idx >= 0) bucket.items[idx] = message;
      })
      .addCase(deleteMessage.fulfilled, (state, action) => {
        const { conversationId, messageId} = action.payload;
        const bucket = state.messagesByConversation[conversationId];
        if (!bucket) return;
        bucket.items = bucket.items.filter((m) => m._id !== messageId);
      })
  },
});

export const { setCurrentConversationId, addDmMessage, setTypingInConversation, markConversationAsReadLocally, participantsAdded, 
  conversationCreated, clearConversations , updateDmMessage, deleteDmMessage} = dmSlice.actions;

export default dmSlice.reducer;

