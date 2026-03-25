import { useEffect, useState, useRef} from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useMemo } from 'react';
import {
  fetchWorkspaces,
  setCurrentWorkspace,
  createWorkspace,
  deleteWorkspace,
  addWorkspaceMember,
  removeWorkspaceMember
} from '../features/workspaceSlice.js';
import {
  fetchChannels,
  setCurrentChannel,
  createChannel,
  deleteChannel,
  clearChannels,
} from '../features/chatSlice.js';
import {
  fetchConversations,
  setCurrentConversationId,
  openConversation,
  clearConversations
} from '../features/dmSlice.js';
import { getConversationTitle } from "../utils/conversationTitle.js";
import { logout } from '../features/authSlice.js';
import { toggleTheme } from '../features/uiSlice.js';
import { getSocket } from '../lib/socket.js';
import { ChannelView } from './ChannelView.jsx';
import { DirectMessageView } from './DirectMessageView.jsx';
import { searchUsers, clearSearchResults } from '../features/usersearchSlice.js';
import { clearWorkspaceError } from '../features/workspaceSlice.js';
import { clearChannelError } from '../features/chatSlice.js';

export function WorkspaceLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { list, currentId } = useSelector((state) => state.workspaces);
  const { channels, currentChannelId } = useSelector((state) => state.chat);
  const { searchResults } = useSelector((state) => state.usersearch);
  const { conversations, currentConversationId } = useSelector((state) => state.dm);
  const { workspaceError} = useSelector((state) => state.workspaces);
  const { channelError} = useSelector((state) => state.chat);
  const theme = useSelector((state) => state.ui.theme);
  const user = useSelector((state) => state.auth.user);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [workspaceUserSearch, setWorkspaceUserSearch] = useState('');
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [removeSearch, setRemoveSearch] = useState('');
const [showRemoveDropdown, setShowRemoveDropdown] = useState(false);
const [sidebarOpen, setSidebarOpen] = useState(false);
const workspaceDropdownRef = useRef(null);
const removeDropdownRef = useRef(null);
const dmDropdownRef = useRef(null);
const sidebarRef = useRef(null);
  useEffect(() => {
    if (!user) return;
    dispatch(fetchWorkspaces());
  }, [dispatch, user?.id]);

  useEffect(() => {
    if (!currentId) return;
    const socket = getSocket();
    if (!socket) return;
  
    const joinWorkspace = () => {
      socket.emit("workspace:join", { workspaceId: currentId });
    };
    
  socket.on("connect", joinWorkspace);
    if (socket.connected) {
      joinWorkspace();
    } else {
      socket.once("connect", joinWorkspace);
    }
  
    return () => {
      const s = getSocket();
      if (s) {
        s.emit('workspace:leave', { workspaceId: currentId });
      }
    };
  }, [currentId, dispatch]);

  useEffect(() => {
    if (workspaceUserSearch.trim().length < 2) return;
  
    const timer = setTimeout(() => {
      dispatch(searchUsers({ query: workspaceUserSearch}));
    }, 300);
  
    return () => clearTimeout(timer);
  }, [workspaceUserSearch, currentId]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        workspaceDropdownRef.current &&
        !workspaceDropdownRef.current.contains(e.target)
      ) {
        setShowWorkspaceDropdown(false);
      }
  
      if (
        removeDropdownRef.current &&
        !removeDropdownRef.current.contains(e.target)
      ) {
        setShowRemoveDropdown(false);
      }
  
      if (
        dmDropdownRef.current &&
        !dmDropdownRef.current.contains(e.target)
      ) {
        setShowUserDropdown(false);
      }

      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target)
      ) {
        setSidebarOpen(false);
      }
    };
  
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentWorkspace = list.find(ws => ws._id === currentId);

  const filteredMembers = useMemo(() => {
    return (currentWorkspace?.members || []).filter((m) => {
      if (!removeSearch.trim()) return true;
  
      const userObj = m.user || m;
      const name = userObj?.name?.toLowerCase() || '';
      const email = userObj?.email?.toLowerCase() || '';
  
      return (
        name.includes(removeSearch.toLowerCase()) ||
        email.includes(removeSearch.toLowerCase())
      );
    });
  }, [currentWorkspace, removeSearch]);

  useEffect(() => {
    if (currentId) {
      dispatch(fetchChannels(currentId));
    }
    else{
      dispatch(clearChannels());
    }
  }, [currentId, dispatch]);

  useEffect(() => {
    if (currentId) {
    dispatch(fetchConversations(currentId));
    }
    else{
      dispatch(clearConversations());
    }
  }, [currentId, dispatch]);

  useEffect(() => {
    if (userSearch.trim().length < 2) {
      dispatch(clearSearchResults());
      return;
    }

    const timer = setTimeout(() => {
      dispatch(searchUsers({ query: userSearch, workspaceId: currentId }));
    }, 300);

    return () => clearTimeout(timer);
  }, [currentId, userSearch, dispatch]);

  const handleOpenDM = async(targetUserId) => {
    const res = await dispatch(openConversation({
      workspaceId: currentId,
      participants: [targetUserId]
    }));
    if (openConversation.fulfilled.match(res)) {
      const convId = res.payload._id;
      setUserSearch('');
      setShowUserDropdown(false);
      navigate(`/app/dm/${convId}`);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className={`app-shell theme-${theme} ${sidebarOpen ? 'sidebar-open' : ''}`}>
    {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} ref={sidebarRef}>
        <div className="sidebar-section">
          <div className="sidebar-header">
            <span>Workspaces</span>
            {isAdmin && (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setCreating(true)
                  dispatch(clearWorkspaceError());
                }}
                title="Create workspace"
              >
                ＋
              </button>
            )}
            <button
              type="button"
              className="ghost"
              onClick={() => dispatch(toggleTheme())}
            >
              {theme === 'dark' ? '☾' : '☀'}
            </button>
          </div>
          {creating && isAdmin && (
            <form
              className="workspace-create"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newWorkspaceName.trim()) return;
                const res = await dispatch(
                  createWorkspace({ name: newWorkspaceName.trim() })
                );
                if (res.meta.requestStatus === 'fulfilled') {
                  setNewWorkspaceName('');
                  setCreating(false);
                }
              }}
            >
              <input
                type="text"
                placeholder="New workspace name"
                value={newWorkspaceName}
                onChange={(e) => {setNewWorkspaceName(e.target.value)
                dispatch(clearWorkspaceError());
                }}
              />
              {workspaceError && <p className="error">{workspaceError}</p>}
              <button type="submit" disabled={!newWorkspaceName.trim()}>
                Create
              </button>
              <button
          type="button"
          className="ghost"
          onClick={() => {
            setCreating(false);
            setNewWorkspaceName('');
          }}
        >
          Cancel
        </button>
            </form>
          )}
          <nav className="workspace-list">
            {list.map((ws) => (
              <div key={ws._id} className="workspace-row">
                <button
                  type="button"
                  className={ws._id === currentId ? 'active' : ''}
                  onClick={() => dispatch(setCurrentWorkspace(ws._id))}
                >
                  {ws.name}
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    className="ghost small"
                    title="Delete workspace"
                    onClick={async () => {
                      setConfirm({ type: 'workspace', id: ws._id, name: ws.name });
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </nav>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-header">
            <span>Channels</span>
          </div>
          {currentId && isAdmin && (
            <form
              className="workspace-create"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newChannelName.trim()) return;
                const res = await dispatch(
                  createChannel({
                    workspaceId: currentId,
                    name: newChannelName.trim(),
                    isPrivate: newChannelPrivate,
                  })
                );
                if (res.meta.requestStatus === 'fulfilled') {
                  const created = res.payload;
                  setNewChannelName('');
                  setNewChannelPrivate(false);
                  if (created?._id) {
                    navigate(`channel/${created._id}`);
                  }
                }
              }}
            >
              <input
                type="text"
                placeholder="New channel name"
                value={newChannelName}
                onChange={(e) => {
                setNewChannelName(e.target.value)
                dispatch(clearChannelError());
                }}
              />
              {channelError && <p className="error">{channelError}</p>}
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={newChannelPrivate}
                  onChange={(e) => setNewChannelPrivate(e.target.checked)}
                />
                Private channel
              </label>
            </form>
          )}
          <nav className="channel-list">
            {channels.map((ch) => (
              <div key={ch._id} className="channel-row">
                <NavLink
                  to={`/app/channel/${ch._id}`}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  onClick={() => {dispatch(setCurrentChannel(ch._id))
                    setSidebarOpen(false);
                  }}
                >
                  {ch.isPrivate ? '🔒' : '#'} {ch.name}
                </NavLink>
                {isAdmin && (
                  <button
                    type="button"
                    className="ghost small"
                    title="Delete channel"
                    onClick={async () => {
                      setConfirm({ type: 'channel', id: ch._id, name: ch.name });
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </nav>
          {currentId && isAdmin && (
            <div className="dm-search-container" ref={workspaceDropdownRef}>
  <input
    type="text"
    className='sidebar-input'
    placeholder="Add member to workspace..."
    title="Add member to workspace..."
    value={workspaceUserSearch}
    onChange={(e) => {
      setWorkspaceUserSearch(e.target.value);
      setShowWorkspaceDropdown(true);
    }}
    onFocus={() => setShowWorkspaceDropdown(true)}
  />

  {showWorkspaceDropdown && searchResults.length > 0 && (
    <div className="user-search-dropdown">
      {searchResults.map(u => (
        <button
        onMouseDown={(e) => e.preventDefault()}
          key={u._id}
          onClick={async () => {
            await dispatch(addWorkspaceMember({
              workspaceId: currentId,
              email: u.email,
              role: 'member'
            }));
            setWorkspaceUserSearch('');
            setShowWorkspaceDropdown(false);
          }}
        >
          <span>{u.name}</span>
          <span>{u.email}</span>
        </button>
      ))}
    </div>
  )}
  </div>
  )}
  {currentId && isAdmin && (
  <div className="dm-search-container" ref={removeDropdownRef}>
  <input
    type="text"
    className='sidebar-input'
    placeholder="Remove member from workspace..."
    title="Remove member from workspace..."
    value={removeSearch}
    onChange={(e) => {
      setRemoveSearch(e.target.value);
      setShowRemoveDropdown(true);
    }}
    onFocus={() => setShowRemoveDropdown(true)}
  />

{removeSearch.length>0 && showRemoveDropdown && filteredMembers?.length > 0 && (
  <div className="user-search-dropdown" >
    {filteredMembers.map(m => (
      <button
        key={m.user?._id || m._id}
        onClick={async () => {
          await dispatch(removeWorkspaceMember({
            workspaceId: currentId,
            userId: m.user._id
          }));
          setRemoveSearch('');
          setShowRemoveDropdown(false);
        }}
      >
        <span>{m.user?.name}</span>
        <span>{m.user?.email}</span>
      </button>
    ))}
  </div>
)}
</div>
  )}    
        </div>
        <div className="sidebar-section">
          <div className="sidebar-header">
            <span>Direct Messages</span>
          </div>
          <div className="dm-search-container" ref={dmDropdownRef}>
            <input 
              className="sidebar-input"
              type="text" 
              placeholder="Find or start a conversation..."
              value={userSearch}
              onChange={(e) => {setUserSearch(e.target.value); setShowUserDropdown(true);}}
              onFocus={() => setShowUserDropdown(true)}
            />
            {showUserDropdown && searchResults.length > 0 && (
              <div className="user-search-dropdown">
                {searchResults.map(u => (
                  <button key={u._id} onClick={() => handleOpenDM(u._id)}>
                    <span className="user-name">{u.name}</span>
                    <span className="user-email">{u.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <nav className="dm-list">
            {conversations.map((conv) => {
              const meId = user?.id;
              const label = getConversationTitle(conv, meId);
              return (
                <button
                  key={conv._id}
                  type="button"
                  className={
                    conv._id === currentConversationId ? 'dm-row active' : 'dm-row'
                  }
                  onClick={() => {
                    dispatch(setCurrentConversationId(conv._id));
                    navigate(`/app/dm/${conv._id}`);
                    setSidebarOpen(false);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="sidebar-section user-row">
          <span>{user?.name}</span>
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              const socket = getSocket();
              if (socket) {
                socket.disconnect();
              }
              setNewChannelName('');
              setNewWorkspaceName('');
              setCreating(false);
              await dispatch(logout());
              navigate('/login');
            }}
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="main-pane">
      <div className="mobile-header">
  <button
    className="hamburger"
    onClick={() => setSidebarOpen(prev => !prev)}
  >
    ☰
  </button>
</div>
        <Routes>
          <Route path="channel/:channelId" element={<ChannelView />} />
          <Route path="dm/:conversationId" element={<DirectMessageView />} />
          <Route path="*" element={<p className='select-channel-p'> Select a channel to start chatting.</p>} />
        </Routes>
      </main>
      {confirm && (
        <div className="modal-overlay" role="presentation" onClick={() => setConfirm(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm delete</h3>
            <p>
              Are you sure you want to delete this {confirm.type}:{' '}
              <strong>{confirm.name}</strong>?
            </p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (confirm.type === 'workspace') {
                    const res = await dispatch(deleteWorkspace(confirm.id));
                    if (deleteWorkspace.fulfilled.match(res)) {
                      if(currentId == confirm.id) {
                        dispatch(clearChannels(confirm.id));
                        dispatch(setCurrentWorkspace(null));
                      }
                      navigate("/app");
                    }
                  } else {
                    const res = await dispatch(deleteChannel({ workspaceId: currentId, channelId: confirm.id }));
                    if (deleteChannel.fulfilled.match(res)) {
                      if(currentChannelId == confirm.id) {
                        dispatch(setCurrentChannel(null));
                      }
                      navigate("/app");
                    }
                  }
                  setConfirm(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

