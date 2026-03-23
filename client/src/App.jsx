import './App.css';
import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AuthPage } from './components/AuthPage.jsx';
import { WorkspaceLayout } from './components/WorkspaceLayout.jsx';
import { Notifications } from './components/Notifications.jsx';
import { bootstrapAuth } from './features/authSlice.js';
import { getSocket, initSocket, disconnectSocket } from './lib/socket.js';

function PrivateRoute({ children }) {
  const { user, initialized, status, accessToken } = useSelector((state) => state.auth);
  if (!initialized || status === 'loading') {
    return <div className="app-root">Loading session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function App() {
  const dispatch = useDispatch();
  const { user, accessToken, initialized } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(bootstrapAuth());
  }, [dispatch]);

  useEffect(() => {
    const handleUnload = () => {
      const socket = getSocket();
      if (socket) {
        socket.disconnect();
      }
    };
  
    window.addEventListener('beforeunload', handleUnload);
  
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

  useEffect(() => {
    if (initialized && accessToken) {
      initSocket();
    }
    return () => {
      disconnectSocket(); 
    };
  }, [initialized, accessToken]);
  return (
    <div className="app-root">
      <Notifications />
      {!initialized ? null : (
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/app" replace /> : <AuthPage mode="login" />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to="/app" replace /> : <AuthPage mode="register" />}
        />
        <Route
          path="/app/*"
          element={
            <PrivateRoute>
              <WorkspaceLayout />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
      )}
    </div>
  );
}

export default App;
