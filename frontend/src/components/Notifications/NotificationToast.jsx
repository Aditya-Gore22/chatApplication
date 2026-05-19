import { useEffect } from 'react';
import { useChat } from '../../context/ChatContext';

const ICONS = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

export default function NotificationToast() {
  const { notifications, removeNotification } = useChat();

  useEffect(() => {
    notifications.forEach((n) => {
      const timer = setTimeout(() => removeNotification(n.id), 4000);
      return () => clearTimeout(timer);
    });
  }, [notifications, removeNotification]);

  if (!notifications.length) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        pointerEvents: 'none',
      }}
      aria-live="assertive"
    >
      {notifications.map((n) => (
        <div
          key={n.id}
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-glass)',
            borderRadius: 'var(--radius-md)',
            padding: '0.625rem 1rem',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem',
            color: 'var(--text-primary)',
            maxWidth: '280px',
            pointerEvents: 'auto',
            animation: 'slideInRight 0.3s ease both',
            backdropFilter: 'var(--blur-md)',
          }}
        >
          <span>{ICONS[n.type] || 'ℹ️'}</span>
          <span style={{ flex: 1 }}>{n.message}</span>
          <button
            onClick={() => removeNotification(n.id)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
