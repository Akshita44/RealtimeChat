import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../lib/api.js';
import { login, register, logout, clearSession } from './authSlice.js';

const initialState = {
  list: [],
  currentId: null,
  workspaceError: null,
  status: 'idle'
};

export const fetchWorkspaces = createAsyncThunk(
  'workspaces/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/workspaces');
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to load workspaces' });
    }
  }
);

export const createWorkspace = createAsyncThunk(
  'workspaces/create',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await api.post('/workspaces', payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to create workspace' });
    }
  }
);

export const deleteWorkspace = createAsyncThunk(
  'workspaces/delete',
  async (workspaceId, { rejectWithValue }) => {
    try {
      await api.delete(`/workspaces/${workspaceId}`);
      return { workspaceId };
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to delete workspace' });
    }
  }
);

export const addWorkspaceMember = createAsyncThunk(
  'workspaces/addMember',
  async ({ workspaceId, email, role }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/workspaces/${workspaceId}/members`, {
        email,
        role: role || 'member',
      });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to add member' });
    }
  }
);

export const removeWorkspaceMember = createAsyncThunk(
  'workspace/removeMember',
  async ({ workspaceId, userId }) => {
    const res = await api.delete(`/workspaces/${workspaceId}/members/${userId}`);
    return res.data;
  }
);

const workspaceSlice = createSlice({
  name: 'workspaces',
  initialState,
  reducers: {
    setCurrentWorkspace(state, action) {
      state.currentId = action.payload;
    },
    clearWorkspaceError(state) {
      state.workspaceError = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkspaces.pending, (state) => {
        state.status = 'loading';
        state.workspaceError = null;
      })
      .addCase(fetchWorkspaces.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.list = action.payload;
        const ids = action.payload.map((w) => w._id);
        if (!ids.includes(state.currentId)) {
          state.currentId = action.payload.length > 0 ? action.payload[0]._id : null;
        }
      })
      .addCase(fetchWorkspaces.rejected, (state, action) => {
        state.status = 'failed';
        state.workspaceError = action.payload?.message || 'Failed to load workspaces';
      })
      .addCase(createWorkspace.fulfilled, (state, action) => {
        state.list.push(action.payload);
        state.currentId = action.payload._id;
      })
      .addCase(createWorkspace.rejected, (state, action) => {
        state.status = 'failed';
        state.workspaceError = action.payload?.message || 'Failed to create workspace';
      })
      .addCase(removeWorkspaceMember.fulfilled, (state, action) => {
        const workspace = action.payload;
      
        const index = state.list.findIndex(w => w._id === workspace._id);
      
        if (index !== -1) {
          state.list[index] = workspace;
        }
      })
      .addCase(deleteWorkspace.fulfilled, (state, action) => {
        const { workspaceId } = action.payload;
        state.list = state.list.filter((w) => w._id !== workspaceId);
        if (state.currentId === workspaceId) {
          state.currentId = state.list.length ? state.list[0]._id : null;
        }
      })
      .addCase(addWorkspaceMember.fulfilled, (state, action) => {
        const workspace = action.payload;
      
        const index = state.list.findIndex(w => w._id === workspace._id);
      
        if (index !== -1) {
          state.list[index] = workspace;
        }
      })      
      .addCase(login.fulfilled, () => initialState)
      .addCase(register.fulfilled, () => initialState)
      .addCase(logout.fulfilled, () => initialState)
      .addCase(clearSession, () => initialState);
  },
});

export const { setCurrentWorkspace, memberAddedToWorkspace, clearWorkspaceError } = workspaceSlice.actions;
export default workspaceSlice.reducer;

