import { useCallback, useRef } from 'react';

/**
 * Returns a human-readable message from a getUserMedia DOMException.
 */
export function getMediaErrorMessage(err) {
  if (!err) return 'Unknown error accessing media devices.';

  const name = err.name || '';

  if (name === 'SecurityError') {
    return (
      'Camera/microphone access requires a secure connection.\n\n' +
      '• On the same device: use http://localhost instead of the IP address.\n' +
      '• On other devices: you need HTTPS (e.g. run behind a reverse proxy with a certificate).\n\n' +
      'Alternatively, in Chrome you can whitelist the IP at:\n' +
      'chrome://flags/#unsafely-treat-insecure-origin-as-secure'
    );
  }

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return (
      'Permission denied by the browser.\n\n' +
      'Click the camera/lock icon in the address bar and allow access, then try again.'
    );
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera or microphone found on this device.';
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return (
      'Camera or microphone is already in use by another application.\n' +
      'Close other apps using it and try again.'
    );
  }

  if (name === 'OverconstrainedError') {
    return 'The requested camera/microphone constraints could not be satisfied.';
  }

  return `Media error (${name || 'unknown'}): ${err.message || ''}`;
}

export function useMediaDevices() {
  const localStreamRef = useRef(null);

  const getStream = useCallback(async ({ video = true, audio = true } = {}) => {
    // getUserMedia only works in secure contexts (localhost or HTTPS)
    if (
      typeof window !== 'undefined' &&
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      const err = new DOMException(
        'getUserMedia is only available in secure contexts (HTTPS or localhost).',
        'SecurityError'
      );
      throw err;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error('[Media] getUserMedia error:', err.name, err.message);
      throw err; // re-throw so callers can handle with getMediaErrorMessage()
    }
  }, []);

  const stopStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }, []);

  const toggleTrack = useCallback((kind) => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getTracks().forEach((t) => {
      if (t.kind === kind) t.enabled = !t.enabled;
    });
  }, []);

  const isTrackEnabled = useCallback((kind) => {
    if (!localStreamRef.current) return false;
    const track = localStreamRef.current.getTracks().find((t) => t.kind === kind);
    return track ? track.enabled : false;
  }, []);

  return { localStreamRef, getStream, stopStream, toggleTrack, isTrackEnabled };
}
