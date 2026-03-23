import { createSlice } from '@reduxjs/toolkit';

const savedTheme = localStorage.getItem('theme');

const initialState = {
  theme: savedTheme || 'dark',
  notifications: [],
};

let nextId = 1;

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', state.theme);
    },
    showNotification: {
      reducer(state, action) {
        state.notifications.push(action.payload);
      },
      prepare({ type = 'info', message }) {
        return { payload: { id: nextId++, type, message } };
      },
    },
    dismissNotification(state, action) {
      state.notifications = state.notifications.filter((n) => n.id !== action.payload);
    },
  },
});

export const { toggleTheme, showNotification, dismissNotification } = uiSlice.actions;
export default uiSlice.reducer;

