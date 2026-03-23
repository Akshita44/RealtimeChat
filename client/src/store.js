import { configureStore } from '@reduxjs/toolkit';
import authReducer from './features/authSlice.js';
import usersearchReducer from './features/usersearchSlice.js';
import workspaceReducer from './features/workspaceSlice.js';
import chatReducer from './features/chatSlice.js';
import dmReducer from './features/dmSlice.js';
import uiReducer from './features/uiSlice.js';
import { injectStore } from './lib/api.js';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    workspaces: workspaceReducer,
    chat: chatReducer,
    dm: dmReducer,
    ui: uiReducer,
    usersearch: usersearchReducer,
  },
});

injectStore(store);

