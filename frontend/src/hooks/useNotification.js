import { useCallback, useRef } from 'react';
import { playNotificationSound } from '../utils/soundUtils';

const NOTIFICATION_PERMISSION_KEY = 'notification_permission';

export function useNotification() {
  const lastNotifRef = useRef(null);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    const perm = await Notification.requestPermission();
    localStorage.setItem(NOTIFICATION_PERMISSION_KEY, perm);
    return perm;
  }, []);

  const triggerNotification = useCallback(
    (title, body = '', options = {}) => {
      // Throttle: don't spam
      const now = Date.now();
      if (lastNotifRef.current && now - lastNotifRef.current < 1500) return;
      lastNotifRef.current = now;

      // Play sound
      playNotificationSound();

      // Browser notification (only when tab is not focused)
      if (document.hidden && Notification.permission === 'granted') {
        const notif = new Notification(title, {
          body,
          icon: '/chat-icon.svg',
          badge: '/chat-icon.svg',
          silent: true,
          ...options,
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
        setTimeout(() => notif.close(), 5000);
      }
    },
    []
  );

  return { requestPermission, triggerNotification };
}
