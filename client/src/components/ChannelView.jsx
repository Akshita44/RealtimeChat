import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchMessages,
  addMessage,
  addChannelMember
} from '../features/chatSlice.js';
import { toggleReaction, editMessage, deleteMessage } from '../features/chatSlice.js';
import { openConversation } from '../features/dmSlice.js';
import { getSocket } from '../lib/socket.js';
import { searchUsers, clearSearchResults } from '../features/usersearchSlice.js';

export function ChannelView() {
  const { channelId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentId: workspaceId } = useSelector((state) => state.workspaces);
  const { messagesByChannel, typing, onlineUsers, channels, usersById, currentChannelId} = useSelector(
    (state) => state.chat
  );
  const { searchResults } = useSelector((state) => state.usersearch);
  const auth = useSelector((state) => state.auth);
  const theme = useSelector((state) => state.ui.theme);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const user = useSelector((state) => state.auth.user);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const observerRef = useRef();
  const [userSearch, setUserSearch] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢'];
  const isAdmin = user?.role === 'admin';
  const bucket = messagesByChannel[channelId] || {
    items: [],
    hasMore: true,
    beforeCursor: null,
  };

  const [showParticipants, setShowParticipants] = useState(false);
const [showAddInput, setShowAddInput] = useState(false);
const participantsRef = useRef(null);

  useEffect(() => {
    if (!workspaceId || !channelId) return;
    dispatch(fetchMessages({ workspaceId, channelId }));
    const socket = getSocket();
    if (!socket) return;
    const joinRoom = (id) => {
      socket.emit('channel:join', { channelId: id });
    };
      if (socket.connected) {
        joinRoom(channelId);
      } else {
        socket.once('connect', () => joinRoom(channelId));
      }

    return () => {
      if (socket) {
        socket.emit('typing', { channelId, isTyping: false });
        socket.emit('channel:leave', { channelId });
        socket.off('connect');
      }
    };
  }, [workspaceId, channelId, dispatch]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (participantsRef.current && !participantsRef.current.contains(e.target)) {
        setShowParticipants(false);
        setShowAddInput(false);
        setShowUserDropdown(false);
      }
    };
  
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (userSearch.trim().length < 2) {
      dispatch(clearSearchResults());
      return;
    }

    const timer = setTimeout(() => {
      dispatch(searchUsers({ query: userSearch, workspaceId }));
    }, 300);

    return () => clearTimeout(timer);
  }, [userSearch, dispatch]);

  const handleOpenDM = async (targetUserId) => {
  const res = await dispatch(openConversation({
    workspaceId,
    participants: [targetUserId]
  }));
  
  if (openConversation.fulfilled.match(res)) {
    const convId = res.payload._id || res.payload.id; 
    
    if (convId) {
      navigate(`/app/dm/${convId}`);
    } else {
      console.error("Payload missing conversation ID", res.payload);
    }
  } else {
    console.error("Failed to open conversation", res.payload);
  }
  };

  useEffect(() => {
    if (!workspaceId || !channelId) return;
    if (!bucket.items.length) return;
    const latest = bucket.items[0];
    if (!latest?.createdAt) return;
    (async () => {
      try {
        await fetch(
          `${
            import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
          }/workspaces/${workspaceId}/channels/${channelId}/messages/read`,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              Authorization: auth.accessToken ? `Bearer ${auth.accessToken}` : undefined,
            },
            body: JSON.stringify({ upTo: latest.createdAt }),
          }
        );
      } catch {
      }
    })();
  }, [workspaceId, channelId, bucket.items, auth.accessToken]);

  const lastMessageElementRef = (node) => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && bucket.hasMore) {
        onLoadMore();
      }
    });
    if (node) observerRef.current.observe(node);
  };

  const onLoadMore = () => {
    if (!bucket.hasMore || !workspaceId || !channelId) return;
    dispatch(
      fetchMessages({
        workspaceId,
        channelId,
        before: bucket.beforeCursor,
      })
    );
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const text = inputRef.current?.value.trim() || '';
    const file = fileRef.current?.files?.[0];
    if (!text && !file) return;

    const formData = new FormData();
    if (text) formData.append('content', text);
    if (file) formData.append('file', file);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/workspaces/${workspaceId}/channels/${channelId}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            Authorization: auth.accessToken ? `Bearer ${auth.accessToken}` : undefined,
          },
          body: formData,
        }
      );
      if (!res.ok) {
        return;
      }
      const created = await res.json();
      dispatch(addMessage({ channelId, message: created }));
      if (inputRef.current) inputRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
      const socket = getSocket();
      socket.emit('typing', { channelId, isTyping: false });
    } catch (err) {
      console.error('Send message failed', err);
    }
  };

  const onInputChange = () => {
    const socket = getSocket();
    const value = inputRef.current?.value || '';
    socket.emit('typing', { channelId, isTyping: value.length > 0 });
  };

  const currentChannel = channels.find((c) => c._id === channelId) || {};
  const typingIds = Object.keys(typing[channelId] || {}).filter((id) => id !== auth.user?.id);
  const typingNames = typingIds
    .map((id) => usersById[id]?.name)
    .filter(Boolean);

  return (
    <div className={`channel-view theme-${theme}`}>
      <header className="channel-header">
        <h2>
          {currentChannel?.isPrivate ? '🔒' : '#'} {currentChannel?.name || channelId}
        </h2>
          <div className="header-right">
          {currentChannel?.isPrivate && isAdmin && (
  <div className="participants-wrapper" ref={participantsRef}>
    <button
      type="button"
      className="ghost"
      onClick={() => setShowParticipants((prev) => !prev)}
    >
      ＋
    </button>

    {showParticipants && (
      <div className="participants-dropdown">
        <div className="participants-header">People</div>

        {(currentChannel?.members || []).map((p) => (
          <div key={p._id} className="participant-row">
            {p.name || usersById[p]?.name}
          </div>
        ))}

        {!showAddInput && (
          <button
            className="add-participant-btn"
            onClick={() => setShowAddInput(true)}
          >
            + Add participant
          </button>
        )}

        {showAddInput && (
          <div className="dm-search-container">
            <input
              className="sidebar-input"
              type="text"
              placeholder="Enter name or email"
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setShowUserDropdown(true);
              }}
              autoFocus
            />

            {showUserDropdown && searchResults.length > 0 && (
              <div className="user-search-dropdown">
                {searchResults.map((u) => (
                  <button
                    key={u._id}
                    onClick={() =>
                      setConfirm({ id: u._id, name: u.name, email: u.email })
                    }
                  >
                    <span className="user-name">{u.name}</span>
                    <span className="user-email">{u.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )}
  </div>
)}
        <input
          className="channel-search"
          type="search"
          placeholder="Search in channel"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              dispatch(
                fetchMessages({
                  workspaceId,
                  channelId,
                  before: undefined,
                  q: e.currentTarget.value || undefined,
                })
              );
            }
          }}
        />
        </div>
      </header>
      <div className="messages-pane">
        {bucket.hasMore && (
          <button type="button" className="ghost small" onClick={onLoadMore}>
            Load older messages
          </button>
        )}
        <div className="messages-list">
        <div ref={lastMessageElementRef} style={{ height: '1px' }} />
          {bucket.items.map((m) => {
            const isOwn = auth.user?.id === m.author?._id;
            const readBy = (m.readBy || []).filter((id) => id !== auth.user?.id);

            let statusLabel = '';
            if (isOwn) {
              if (readBy.length > 0) statusLabel = '✓✓ (read)';
              else statusLabel = '✓ (sent)';
            }

            const reactionSummary = {};
            (m.reactions || []).forEach((r) => {
              if (!reactionSummary[r.emoji]) {
                reactionSummary[r.emoji] = { emoji: r.emoji, count: 0, reacted: false };
              }
              reactionSummary[r.emoji].count += 1;
              if (r.user === auth.user?.id) {
                reactionSummary[r.emoji].reacted = true;
              }
            });

            return (
              <div key={m._id} className="message-row">
                <div className="message-meta">
                  <span className="presence-dot">
                    {onlineUsers[m.author?._id] ? '●' : '○'}
                  </span>
                  <span
                    type="button"
                    className="author"
                    onClick={() => {
                      if (!m.author?._id || m.author._id === auth.user?.id) return;
                      handleOpenDM(m.author._id);
                    }}
                  >
                    {m.author?.name || 'Unknown'}
                  </span>
                  <span className="timestamp">
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {isOwn && statusLabel && (
                    <span className="message-status">{statusLabel}</span>
                  )}
                </div>
                <div className="message-body">
                {editingId === m._id ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!editText.trim()) return;
                      const res = await dispatch(editMessage({ 
                        workspaceId, 
                        channelId, 
                        messageId: m._id, 
                        content: editText.trim() 
                      }));
                      
                      if (editMessage.fulfilled.match(res)) {
                        setEditingId(null);
                        setEditText('');
                      }
                    }}
                  >
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                  </form>
                ) : (
                  <>
                    {m.content && <p>{m.content}</p>}
                    {m.fileUrl && (
                      <a href={m.fileUrl} target="_blank" rel="noreferrer">
                        {m.fileName || 'Attachment'}
                      </a>
                    )}
                  </>
                )}
                <div className="message-reactions">
                  {Object.values(reactionSummary).map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      className={`reaction-chip ${r.reacted ? 'reacted' : ''}`}
                      onClick={() => {
                        dispatch(toggleReaction({ 
                          workspaceId, 
                          channelId, 
                          messageId: m._id, 
                          emoji: r.emoji 
                        }));
                      }}
                    >
                      {r.emoji} {r.count || ''}
                    </button>
                  ))}
                  <div className="reaction-picker-wrapper">
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() =>
                        setReactionPickerFor(
                          reactionPickerFor === m._id ? null : m._id
                        )
                      }
                    >
                      🙂
                    </button>
                    {reactionPickerFor === m._id && (
                      <div className="reaction-picker">
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              dispatch(toggleReaction({ 
                                workspaceId, 
                                channelId, 
                                messageId: m._id, 
                                emoji: emoji 
                              }));
                              setReactionPickerFor(null);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="message-actions">
                  {auth.user?.id === m.author?._id && (
                    <>
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => {
                          setEditingId(m._id);
                          setEditText(m.content || '');
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => {
                          dispatch(
                            deleteMessage({
                              workspaceId,
                              channelId,
                              messageId: m._id,
                              accessToken: auth.accessToken,
                            })
                          );
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
        {typingIds.length > 0 && (
          <div className="typing-indicator">
            {typingNames.length
              ? `${typingNames.join(', ')} ${typingNames.length === 1 ? 'is' : 'are'} typing…`
              : typingIds.length === 1
                ? 'Someone is typing…'
                : 'Several people are typing…'}
          </div>
        )}
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Message channel"
          onChange={onInputChange}
          onBlur={() => {
            const socket = getSocket();
            socket.emit('typing', { channelId, isTyping: false });
          }}
        />
        <input ref={fileRef} type="file" className="file-input" />
        <button type="submit">Send</button>
      </form>
      {confirm && (
        <div className="modal-overlay" role="presentation" onClick={() => setConfirm(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Add</h3>
            <p>
              Are you sure you want to add user
              <strong> {confirm.name}</strong>?
            </p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  await dispatch(
                    addChannelMember({
                      workspaceId,
                      channelId: channelId,
                      email: confirm.email,
                    })
                  );
                  setConfirm(false);
                  setUserSearch('');
                  setShowUserDropdown(false);
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

