import { useMemo, useState } from 'react';
import { useChat } from '../../context/ChatContext';
import './Sidebar.css';

const AVATAR_CLASSES = ['', 'alt1', 'alt2', 'alt3', 'alt4'];

function getAvatarClass(userId) {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return AVATAR_CLASSES[Math.abs(hash) % AVATAR_CLASSES.length];
}

export default function Sidebar({ onSelectPeer, onLogout, mobileHidden = false }) {
  const {
    currentUser,
    onlineUsers,
    activePeer,
    unreadCounts,
    connectionStatus,
    typingUsers,
  } = useChat();

  const [search, setSearch] = useState('');

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return onlineUsers.filter((u) => u.username.toLowerCase().includes(q));
  }, [onlineUsers, search]);

  return (
    <aside
      className={`sidebar${mobileHidden ? ' mobile-hidden' : ''}`}
      role="complementary"
      aria-label="Online users"
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="sidebar-header">
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {currentUser?.username?.[0]?.toUpperCase() || '?'}
            <span className="online-badge" />
          </div>
          <div className="sidebar-user-info">
            <h3 className="truncate">{currentUser?.username}</h3>
            <p>● Online</p>
          </div>
          <button
            id="logout-btn"
            className="btn-logout"
            onClick={onLogout}
            title="Sign out"
          >
            Sign out
          </button>
        </div>

        <div className="sidebar-search">
          <span className="sidebar-search-icon">🔍</span>
          <input
            id="user-search-input"
            type="text"
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search online users"
          />
        </div>
      </div>

      {/* ── Users list ────────────────────────────────────────────────────── */}
      <div className="sidebar-section-title">
        Online — {filteredUsers.length}
      </div>

      <div className="sidebar-users" role="list">
        {filteredUsers.length === 0 ? (
          <div className="sidebar-empty">
            <div className="sidebar-empty-icon">
              {search ? '🔍' : '👥'}
            </div>
            <p>
              {search
                ? 'No users match your search'
                : 'Waiting for others to join…\nShare the link!'}
            </p>
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isActive = activePeer?.socketId === user.socketId;
            const unread = unreadCounts[user.userId] || 0;
            const status = connectionStatus[user.userId];
            const isTyping = typingUsers[user.socketId];

            return (
              <div
                key={user.socketId}
                className={`user-item ${isActive ? 'active' : ''}`}
                role="listitem"
                onClick={() => onSelectPeer(user)}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelectPeer(user)}
                aria-label={`Chat with ${user.username}`}
                id={`user-${user.userId}`}
              >
                <div className={`user-avatar ${getAvatarClass(user.userId)}`}>
                  {user.username[0].toUpperCase()}
                  <span className="user-status-dot" />
                </div>

                <div className="user-info">
                  <div className="user-name">{user.username}</div>
                  <div className={`user-sub ${status === 'connected' ? 'connected' : ''}`}>
                    {isTyping ? (
                      <span>✍️ typing…</span>
                    ) : status === 'connected' ? (
                      <span>🔗 connected</span>
                    ) : status === 'connecting' ? (
                      <span>⟳ connecting…</span>
                    ) : (
                      <span>● online</span>
                    )}
                  </div>
                </div>

                {unread > 0 && (
                  <div className="user-unread" aria-label={`${unread} unread`}>
                    {unread > 99 ? '99+' : unread}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="sidebar-footer">
        <span className="dot" />
        {onlineUsers.length + 1} online (including you)
      </div>
    </aside>
  );
}
