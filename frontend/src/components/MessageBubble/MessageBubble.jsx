import { useEffect, useRef, useState } from 'react';
import { fileTypeIcon, formatFileSize } from '../../utils/fileUtils';
import './MessageBubble.css';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function StatusIcon({ status }) {
  if (status === 'sending') return <span className="status-icon" title="Sending">⏳</span>;
  if (status === 'sent')    return <span className="status-icon" title="Sent">✓</span>;
  if (status === 'read')    return <span className="status-icon" title="Read" style={{ color: '#60a5fa' }}>✓✓</span>;
  if (status === 'failed')  return <span className="status-icon" title="Failed" style={{ color: 'var(--danger)' }}>!</span>;
  return null;
}

export default function MessageBubble({ message }) {
  const { text, type, isSent, timestamp, status, fileName, fileSize, mimeType, url, isImage, isVideo } = message;

  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => {
      if (!menuRef.current?.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text || fileName || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
    setShowMenu(false);
  };

  const isFile = type === 'file';

  return (
    <div className={`message-bubble-row ${isSent ? 'sent' : 'received'}`}>
      <div
        className={`bubble ${isSent ? 'sent' : 'received'} ${status === 'failed' ? 'failed' : ''}`}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowMenu((v) => !v);
        }}
        onClick={() => showMenu && setShowMenu(false)}
      >
        {/* Image */}
        {isFile && isImage && url && (
          <div
            className="bubble-image-wrap"
            onClick={() => window.open(url, '_blank')}
            title="Click to view full size"
          >
            <img className="bubble-image" src={url} alt={fileName || 'Image'} />
            <a
              className="bubble-img-download"
              href={url}
              download={fileName}
              onClick={(e) => e.stopPropagation()}
              title="Download"
            >
              ⬇
            </a>
          </div>
        )}

        {/* Video */}
        {isFile && isVideo && url && (
          <div className="bubble-video-wrap">
            <video
              className="bubble-video"
              src={url}
              controls
              playsInline
              preload="metadata"
            />
            <div className="bubble-file-footer">
              <span className="bubble-file-name">{fileName}</span>
              <a
                className="btn-download"
                href={url}
                download={fileName}
                onClick={(e) => e.stopPropagation()}
              >
                ⬇
              </a>
            </div>
          </div>
        )}

        {/* Non-image, non-video file */}
        {isFile && !isImage && !isVideo && (

          <div className="bubble-file">
            <span className="bubble-file-icon">{fileTypeIcon(mimeType)}</span>
            <div className="bubble-file-info">
              <div className="bubble-file-name">{fileName}</div>
              {fileSize && (
                <div className="bubble-file-size">{formatFileSize(fileSize)}</div>
              )}
            </div>
            {url && (
              <a
                className="btn-download"
                href={url}
                download={fileName}
                onClick={(e) => e.stopPropagation()}
              >
                ⬇
              </a>
            )}
          </div>
        )}

        {/* Text */}
        {!isFile && text && (
          <p className="bubble-text">{text}</p>
        )}

        {/* File caption if image */}
        {isFile && isImage && fileName && (
          <p className="bubble-text" style={{ fontSize: '0.78rem', opacity: 0.8, marginTop: '0.25rem' }}>
            {fileName}
          </p>
        )}

        {/* Failed notice */}
        {status === 'failed' && (
          <p className="bubble-failed-notice">Failed to send</p>
        )}

        {/* Meta */}
        <div className="bubble-meta">
          <span>{formatTime(timestamp)}</span>
          {isSent && <StatusIcon status={status} />}
        </div>

        {/* Context menu */}
        {showMenu && (
          <div
            ref={menuRef}
            className={`bubble-context-menu ${isSent ? 'sent' : 'received'}`}
          >
            <div className="context-menu-item" onClick={handleCopy}>
              {copied ? '✅ Copied!' : '📋 Copy'}
            </div>
            {isFile && url && (
              <a
                className="context-menu-item"
                href={url}
                download={fileName}
                style={{ textDecoration: 'none' }}
                onClick={() => setShowMenu(false)}
              >
                ⬇️ Download
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
