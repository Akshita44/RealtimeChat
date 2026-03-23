import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../lib/api.js';

export const searchUsers = createAsyncThunk(
    'dm/searchUsers',
    async ({query, workspaceId}, { rejectWithValue }) => {
      try {
        const res = await api.get(`/users/search`,{
          params:{
            q: query,
            workspaceId
        }});
        return res.data;
      } catch (err) {
        return rejectWithValue(err.response?.data || { message: 'Search failed' });
      }
    }
  );
  
  const usersearchSlice = createSlice({
    name: 'usersearch',
    initialState: {
      searchResults: [],
    },
    reducers: {
      clearSearchResults(state) {
        state.searchResults = [];
      }
    },
    extraReducers: (builder) => {
      builder
        .addCase(searchUsers.fulfilled, (state, action) => {
          state.searchResults = action.payload;
        })
        .addCase(searchUsers.rejected, (state) => {
          state.searchResults = [];
        });
    },
  });
  
  export const { clearSearchResults } = usersearchSlice.actions;
  export default usersearchSlice.reducer;