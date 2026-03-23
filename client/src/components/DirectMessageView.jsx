import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import {
  fetchConversationMessages,
  sendDirectMessage,
  markConversationAsReadLocally,
  addMemberToConversation
} from '../features/dmSlice.js';
import { toggleReaction, editMessage, deleteMessage } from '../features/dmSlice.js';
import { searchUsers, clearSearchResults } from '../features/usersearchSlice.js';

import { getSocket } from '../lib/socket.js';
import { getConversationTitle, getTypingInfo } from "../utils/conversationTitle.js";

export function DirectMessageView() {
  const { conversationId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { messagesByConversation, conversations, typing } = useSelector((state) => state.dm);
  const { onlineUsers} = useSelector(
    (state) => state.chat
  );
  const { currentId: workspaceId } = useSelector((state) => state.workspaces);
  const auth = useSelector((state) => state.auth);
  const theme = useSelector((state) => state.ui.theme);
  const { searchResults } = useSelector((state) => state.usersearch);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const conversationIdRef = useRef(conversationId);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢'];
  const [showParticipants, setShowParticipants] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);
  const participantsRef = useRef(null);
  const bucket = messagesByConversation[conversationId] || {
    items: [],
    hasMore: true,
    beforeCursor: null,
  };

  useEffect(() => {
    const userId = auth.user?.id || auth.user?._id; 
    if (!conversationId || !userId) return;
    dispatch(fetchConversationMessages({ conversationId }));
    const socket = getSocket();
    if (!socket) return;
    const handleJoinAndRead = () => {
    socket.emit('conversation:join', { conversationId });
      socket.emit('conversation:markRead', { conversationId });
    };
  
    if (socket.connected) {
      handleJoinAndRead();
    } else {
      socket.once('connect', handleJoinAndRead);
    }
  
    const onReadUpdate = (data) => {
      if (data.conversationId === conversationIdRef.current) {
        dispatch(markConversationAsReadLocally({ 
          conversationId: data.conversationId, 
          userId: data.readByUserId 
        }));
      }
    };

    socket.on('conversation:readUpdate', onReadUpdate);
    return () => {
      if (socket) {
        socket.emit('typingInConversation', { conversationId, isTyping: false });
        socket.emit('conversation:leave', { conversationId });
        socket.off('connect');
      }
    };
  }, [conversationId, dispatch, auth.user?.id]);

  useEffect(() => {
    if (!conversationId) return;
  
    const conversation = conversations.find(c => c._id === conversationId);
    const currentUserId = auth.user?.id;
  
    if (!conversation) {
      navigate('/');
      return;
    }
  
    const isStillMember = conversation.participants?.some(
      p => p._id === currentUserId
    );
  
    if (!isStillMember) {
      navigate('/');
    }
  }, [conversationId, conversations, auth.user?.id]);

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
    if (!showParticipants) {
      setUserSearch('');
      setShowAddInput(false);
    }
  }, [showParticipants]);
  
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

  const onSubmit = async (e) => {
    e.preventDefault();
    const text = inputRef.current?.value.trim() || '';
    const file = fileRef.current?.files?.[0];
    if (!text && !file) return;

    const formData = new FormData();
    if (text) formData.append('content', text);
    if (file) formData.append('file', file);
    try {

    const res = await dispatch(sendDirectMessage({ conversationId, formData }));
    if (res.meta.requestStatus === 'fulfilled') {
      if (inputRef.current) inputRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
      const socket = getSocket();
      if(socket && socket.connected)
      {
      socket.emit('typingInConversation', { conversationId, isTyping: false });
      }
    } catch (err) {
      console.error('Send message failed', err);
    }
  };

  const onInputChange = () => {
    const socket = getSocket();
    const value = inputRef.current?.value || '';
    if(socket && socket.connected)
      {
    socket.emit('typingInConversation', { conversationId, isTyping: value.length > 0 });
      }
  };

const conversation = conversations.find(c => c._id === conversationId);

const title = getConversationTitle(conversation, auth.user?.id);
const {typingIds, typingNames} = getTypingInfo(conversation, typing, auth.user?.id);
  return (
    <div className={`channel-view theme-${theme}`}>
      <header className="channel-header">
        <h2>{title}</h2>
        <div className="header-right">
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

      {(conversation?.participants || []).map((p) => (
        <div key={p._id} className="participant-row">
          {p.name}
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
        <input
          className="channel-search"
          type="search"
          placeholder="Search in channel"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              dispatch(
                fetchConversationMessages({
                  conversationId,
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
        <div className="messages-list">
          
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
return(
            <div key={m._id} className="message-row">
              <div className="message-meta">
                <span className="presence-dot">
                    {onlineUsers[m.author?._id] ? '●' : '○'}
                </span>
                <span className="author">{m.author?.name || 'Unknown'}</span>
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
                        messageId: m._id, 
                        conversationId,
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
              </div>
              <div className="message-reactions">
                  {Object.values(reactionSummary).map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      className={`reaction-chip ${r.reacted ? 'reacted' : ''}`}
                      onClick={() => {
                        dispatch(toggleReaction({ 
                          messageId: m._id, 
                          conversationId,
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
                                messageId: m._id, 
                                conversationId,
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
                              messageId: m._id,
                              conversationId,
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
          );})}
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
            if(socket && socket.connected)
            {
            socket.emit('typingInConversation', { conversationId, isTyping: false });
            }
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
              <strong>{confirm.name}</strong>?
            </p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  dispatch(
                    addMemberToConversation({
                      workspaceId,
                      conversationId,
                      participants: [confirm.id],
                    })
                  );
                  setUserSearch('');
                  setConfirm(false);
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

