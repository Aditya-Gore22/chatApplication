import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useChat } from '../../context/ChatContext';
import { useSocket } from '../../context/SocketContext';
import { useNotification } from '../../hooks/useNotification';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState(() => localStorage.getItem('chat_username') || '');
  const [error, setError] = useState('');

  const { setCurrentUser } = useChat();
  const { socket } = useSocket();
  const { requestPermission } = useNotification();

  const validate = (name) => {
    if (!name.trim()) return 'Username is required';
    if (name.trim().length < 2) return 'Username must be at least 2 characters';
    if (name.trim().length > 30) return 'Username must be 30 characters or less';
    if (!/^[a-zA-Z0-9_ ]+$/.test(name.trim()))
      return 'Only letters, numbers, spaces, and underscores allowed';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = username.trim();
    const err = validate(trimmed);
    if (err) {
      setError(err);
      return;
    }

    setError('');

    // Request notification permission (non-blocking)
    requestPermission();

    // Get or generate userId
    let userId = localStorage.getItem('chat_user_id');
    if (!userId) {
      userId = uuidv4();
      localStorage.setItem('chat_user_id', userId);
    }

    localStorage.setItem('chat_username', trimmed);

    // Announce presence via socket
    socket.emit('user-online', { userId, username: trimmed });

    // Immediately transition (socket is fire-and-forget for signaling)
    setCurrentUser({ userId, username: trimmed });
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">💬</div>
          <div className="login-logo-text">
            <h1>P2P Chat</h1>
            <p>Secure · Real-time · Peer-to-peer</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <h2>Welcome back</h2>
          <p>Enter your username to start chatting</p>

          <div className="form-group">
            <label htmlFor="username-input">Username</label>
            <input
              id="username-input"
              type="text"
              className={`form-input ${error ? 'error' : ''}`}
              placeholder="e.g. Alex or cool_user"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError('');
              }}
              maxLength={30}
              autoFocus
              autoComplete="username"
            />
            {error && <p className="form-error">{error}</p>}
          </div>

          <button
            id="login-btn"
            type="submit"
            className="btn-login"
            disabled={!username.trim()}
          >
            🚀 Start Chatting
          </button>
        </form>

        <div className="login-features">
          <div className="login-feature">
            <div className="login-feature-icon">🔒</div>
            <p>End-to-end encrypted P2P</p>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon">⚡</div>
            <p>Real-time messaging</p>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon">📁</div>
            <p>File & image sharing</p>
          </div>
        </div>
      </div>
    </div>
  );
}
