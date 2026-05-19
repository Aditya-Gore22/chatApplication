import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import 'emoji-picker-element';
import { useChat } from '../../context/ChatContext';
import { useSocket } from '../../context/SocketContext';
import MessageBubble from '../MessageBubble/MessageBubble';
import { formatFileSize } from '../../utils/fileUtils';
import './ChatArea.css';

const TYPING_DEBOUNCE = 1200;

export default function ChatArea({ onStartCall, peerActions, mobileHidden = false, onBackToSidebar }) {
  const {
    currentUser,
    activePeer,
    messages,
    typingUsers,
    connectionStatus,
    addNotification,
  } = useChat();

  const { socket } = useSocket();
  const { sendMessage, sendFile, isConnected } = peerActions;

  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingFile, setPendingFile] = useState(null); // { file, previewUrl }
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const emojiPickerRef = useRef(null);

  const peerMessages = activePeer ? messages[activePeer.userId] || [] : [];
  const isTyping = activePeer ? typingUsers[activePeer.socketId] : false;
  const connStatus = activePeer ? connectionStatus[activePeer.userId] : null;

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [peerMessages, isTyping]);

  // ── Emoji picker ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const picker = emojiPickerRef.current;
    if (!picker) return;
    const handler = (e) => {
      setText((prev) => prev + e.detail.unicode);
      setShowEmoji(false);
      inputRef.current?.focus();
    };
    picker.addEventListener('emoji-click', handler);
    return () => picker.removeEventListener('emoji-click', handler);
  }, [showEmoji]);

  // Close emoji on outside click
  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e) => {
      if (!e.target.closest('.emoji-picker-container') && !e.target.closest('.btn-emoji')) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmoji]);

  // ── Typing indicator ─────────────────────────────────────────────────────────
  const emitTyping = useCallback(
    (val) => {
      if (!socket || !activePeer) return;
      socket.emit('typing', { to: activePeer.socketId, isTyping: val });
    },
    [socket, activePeer]
  );

  const handleTextChange = (e) => {
    setText(e.target.value);
    if (!typingTimeoutRef.current) {
      emitTyping(true);
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping(false);
      typingTimeoutRef.current = null;
    }, TYPING_DEBOUNCE);
  };

  // ── Send text message ─────────────────────────────────────────────────────────
  const handleSendText = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || !activePeer) return;

    if (!isConnected) {
      addNotification('⏳ P2P connection not ready yet — please wait a moment', 'warning');
      return;
    }

    const messageId = uuidv4();
    const msg = {
      id: messageId,
      text: trimmed,
      isSent: true,
      timestamp: Date.now(),
      status: 'sending',
    };

    // Optimistically add to local messages via context
    // We import addMessage from peerActions
    peerActions.addMessageLocal(activePeer.userId, msg);
    setText('');
    emitTyping(false);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;

    const ok = sendMessage({ peerId: activePeer.userId, text: trimmed, messageId });
    if (ok) {
      peerActions.updateStatus(activePeer.userId, messageId, 'sent');
    } else {
      peerActions.updateStatus(activePeer.userId, messageId, 'failed');
    }
  }, [text, activePeer, sendMessage, emitTyping, peerActions]);

  // ── Send file ─────────────────────────────────────────────────────────
  const handleSendFile = useCallback(async () => {
    if (!pendingFile || !activePeer) return;

    // Capture refs BEFORE clearing state
    const { file, previewUrl } = pendingFile;

    setUploadProgress(0);
    setPendingFile(null);

    const ok = await sendFile({
      peerId: activePeer.userId,
      file,
      onProgress: setUploadProgress,
    });

    if (ok) {
      // Generate a local object URL for the sender if none exists
      const displayUrl = previewUrl || URL.createObjectURL(file);
      const fileMsg = {
        id: uuidv4(),
        type: 'file',
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        url: displayUrl,
        isImage: file.type.startsWith('image/'),
        isVideo: file.type.startsWith('video/'),
        isSent: true,
        timestamp: Date.now(),
        status: 'sent',
      };
      peerActions.addMessageLocal(activePeer.userId, fileMsg);
    }
    setUploadProgress(null);
  }, [pendingFile, activePeer, sendFile, peerActions]);


  // ── Key handler ──────────────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (pendingFile) {
        handleSendFile();
      } else {
        handleSendText();
      }
    }
  };

  // ── File input ───────────────────────────────────────────────────────────────
  const handleFileSelect = (file) => {
    if (!file) return;
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setPendingFile({ file, previewUrl });
  };

  // ── Drag and drop ─────────────────────────────────────────────────────────────
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  // ── Date grouping ────────────────────────────────────────────────────────────
  const groupedMessages = peerMessages.reduce((groups, msg) => {
    const date = new Date(msg.timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year:
        new Date(msg.timestamp).getFullYear() !== new Date().getFullYear()
          ? 'numeric'
          : undefined,
    });
    const last = groups[groups.length - 1];
    if (!last || last.date !== date) {
      groups.push({ date, messages: [msg] });
    } else {
      last.messages.push(msg);
    }
    return groups;
  }, []);

  // ── No peer selected ─────────────────────────────────────────────────────────
  if (!activePeer) {
    return (
      <div className={`chat-area${!mobileHidden ? ' mobile-visible' : ''}`}>
        <div className="chat-placeholder">
          <div className="chat-placeholder-icon">💬</div>
          <h2>Select a user to start chatting</h2>
          <p>Choose from the online users on the left</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`chat-area${!mobileHidden ? ' mobile-visible' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drag-overlay">
          <span style={{ fontSize: '2.5rem' }}>📁</span>
          <p>Drop file to send</p>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="chat-header">
        {/* Mobile back button */}
        <button
          className="chat-header-back"
          onClick={onBackToSidebar}
          aria-label="Back to contacts"
        >
          ←
        </button>
        <div className="chat-header-avatar">
          {activePeer.username[0].toUpperCase()}
        </div>
        <div className="chat-header-info">
          <h2>{activePeer.username}</h2>
          <div
            className={`chat-header-status ${
              connStatus === 'connected'
                ? 'connected'
                : connStatus === 'connecting'
                ? 'connecting'
                : ''
            }`}
          >
            {connStatus === 'connected'
              ? '🔗 P2P connected'
              : connStatus === 'connecting'
              ? '⟳ Connecting…'
              : '● Online'}
          </div>
        </div>

        <div className="chat-header-actions">
          <button
            id="btn-audio-call"
            className="btn-icon"
            title="Audio call"
            onClick={() => onStartCall('audio')}
          >
            📞
          </button>
          <button
            id="btn-video-call"
            className="btn-icon"
            title="Video call"
            onClick={() => onStartCall('video')}
          >
            📹
          </button>
        </div>
      </div>

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <div className="chat-messages" role="log" aria-live="polite" aria-label="Messages">
        {connStatus === 'connecting' && (
          <div className="connecting-banner">
            ⟳ Establishing P2P connection…
          </div>
        )}

        {peerMessages.length === 0 && connStatus !== 'connecting' && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2rem' }}>
            🔒 Messages travel directly peer-to-peer<br />
            <span style={{ fontSize: '0.75rem' }}>Start the conversation!</span>
          </div>
        )}

        {groupedMessages.map((group) => (
          <div key={group.date}>
            <div className="chat-date-divider">{group.date}</div>
            {group.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        ))}

        {isTyping && (
          <div className="typing-indicator">
            <div className="typing-bubbles">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
            <span className="typing-label">{activePeer.username} is typing…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <div className="chat-input-area">
        {/* File preview chip */}
        {pendingFile && (
          <div className="file-preview-chip">
            {pendingFile.previewUrl ? (
              <img className="chip-img" src={pendingFile.previewUrl} alt="Preview" />
            ) : (
              <span>📎</span>
            )}
            <span className="chip-name">{pendingFile.file.name}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
              {formatFileSize(pendingFile.file.size)}
            </span>
            <button
              className="chip-remove"
              onClick={() => {
                if (pendingFile.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
                setPendingFile(null);
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Upload progress */}
        {uploadProgress !== null && (
          <div className="upload-progress">
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Sending… {uploadProgress}%
            </span>
            <div className="upload-progress-bar">
              <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        <div className="chat-input-toolbar">
          {/* Emoji picker */}
          {showEmoji && (
            <div className="emoji-picker-container">
              <emoji-picker ref={emojiPickerRef} />
            </div>
          )}

          <div className="chat-input-actions">
            <button
              id="btn-emoji"
              className="btn-emoji"
              title="Emoji"
              onClick={() => setShowEmoji((v) => !v)}
            >
              😊
            </button>
            <button
              id="btn-attach"
              className="btn-attach"
              title="Attach file"
              onClick={() => fileInputRef.current?.click()}
            >
              📎
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="file-input-hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              accept="*/*"
              id="file-input"
            />
          </div>

          <div className="chat-input-wrap">
            <textarea
              ref={inputRef}
              id="message-input"
              className="chat-input"
              placeholder="Type a message… (Shift+Enter for new line)"
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              rows={1}
            />
          </div>

          <button
            id="btn-send"
            className="btn-send"
            onClick={pendingFile ? handleSendFile : handleSendText}
            disabled={!text.trim() && !pendingFile}
            title="Send"
          >
            ➤
          </button>
        </div>

        {!isConnected && connStatus === 'connected' && (
          <p className="not-connected-notice" style={{ color: 'var(--warning)' }}>
            ⚠️ P2P channel initialising — send will retry automatically
          </p>
        )}
        {!isConnected && !connStatus && (
          <p className="not-connected-notice">
            Click a user to establish a P2P connection
          </p>
        )}
      </div>
    </div>
  );
}
