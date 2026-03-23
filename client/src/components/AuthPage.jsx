import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../features/authSlice.js';
import { toggleTheme } from '../features/uiSlice.js';
import { getSocket } from '../lib/socket.js';

export function AuthPage({ mode }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { status, error } = useSelector((state) => state.auth);
  const theme = useSelector((state) => state.ui.theme);
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const isLogin = mode === 'login';

  const onChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (isLogin) {
      const res = await dispatch(login({ email: form.email, password: form.password }));
      if (res.meta.requestStatus === 'fulfilled') {
        getSocket();
        navigate('/app');
      }
      else if (res.payload?.message === 'User not found') {
        navigate('/register');
      }
    } else {
      const res = await dispatch(
        register({ name: form.name, email: form.email, password: form.password })
      );
      if (res.meta.requestStatus === 'fulfilled') {
        getSocket();
        navigate('/app');
      }
    }
  };

  return (
    <div className={`auth-page theme-${theme}`}>
      <div className="auth-card">
        <header className="auth-header">
          <h1>Team Workspace</h1>
          <button type="button" className="ghost" onClick={() => dispatch(toggleTheme())}>
            Toggle {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </header>
        <h2>{isLogin ? 'Sign in' : 'Create your account'}</h2>
        <form className="auth-form" onSubmit={onSubmit}>
          {!isLogin && (
            <label>
              <span>Name</span>
              <input
                name="name"
                type="text"
                required
                value={form.name}
                onChange={onChange}
              />
            </label>
          )}
          <label>
            <span>Email</span>
            <input
              name="email"
              type="email"
              required
              value={form.email}
              onChange={onChange}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              required
              value={form.password}
              onChange={onChange}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Working...' : isLogin ? 'Sign in' : 'Sign up'}
          </button>
        </form>
        <div className="auth-switch">
          {isLogin ? (
            <p>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => navigate('/register')}
              >
                Sign up
              </button>
            </p>
          ) : (
            <p>
              Already registered?{' '}
              <button type="button" className="link-button" onClick={() => navigate('/login')}>
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

