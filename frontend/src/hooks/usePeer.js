import { useCallback, useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import { useSocket } from '../context/SocketContext';
import { useChat } from '../context/ChatContext';
import { sanitizeMessage } from '../utils/sanitize';
import { chunkFile, reassembleFile } from '../utils/fileUtils';
import { useNotification } from './useNotification';

const CHUNK_SIZE = 8 * 1024; // 8 KB binary → ~11 KB base64 JSON, well under 16 KB DataChannel limit


export function usePeer() {
  const { socket } = useSocket();
  const {
    currentUser,
    peerRef,
    addMessage,
    setConnectionStatus,
    setTyping,
    addNotification,
    setCallState,
  } = useChat();

  const { triggerNotification } = useNotification();

  // File reassembly buffer
  const fileBufferRef = useRef({});
  const typingTimeoutRef = useRef({});

  // Reactive connection state (triggers re-render)
  const [isConnected, setIsConnected] = useState(false);

  // Keep refs to latest callbacks to avoid stale closures inside peer events
  const addMessageRef = useRef(addMessage);
  const triggerNotificationRef = useRef(triggerNotification);
  const addNotificationRef = useRef(addNotification);
  const setConnectionStatusRef = useRef(setConnectionStatus);
  const setCallStateRef = useRef(setCallState);
  const socketRef = useRef(socket);
  const currentUserRef = useRef(currentUser);

  useEffect(() => { addMessageRef.current = addMessage; }, [addMessage]);
  useEffect(() => { triggerNotificationRef.current = triggerNotification; }, [triggerNotification]);
  useEffect(() => { addNotificationRef.current = addNotification; }, [addNotification]);
  useEffect(() => { setConnectionStatusRef.current = setConnectionStatus; }, [setConnectionStatus]);
  useEffect(() => { setCallStateRef.current = setCallState; }, [setCallState]);
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // ── Handle incoming DataChannel data ─────────────────────────────────────────
  const handleIncomingData = useCallback((rawData, peerUserId) => {
    let parsed;
    try {
      if (typeof rawData === 'string') {
        parsed = JSON.parse(rawData);
      } else {
        const text = new TextDecoder().decode(rawData);
        parsed = JSON.parse(text);
      }
    } catch {
      return;
    }
    if (!parsed?.type) return;

    switch (parsed.type) {
      case 'text': {
        const msg = {
          id: parsed.id,
          text: sanitizeMessage(parsed.text),
          isSent: false,
          timestamp: parsed.timestamp || Date.now(),
          status: 'received',
        };
        addMessageRef.current(parsed.senderId, msg);
        triggerNotificationRef.current('New message', parsed.text.substring(0, 60));
        break;
      }
      case 'file-meta': {
        fileBufferRef.current[parsed.transferId] = {
          meta: parsed,
          chunks: [],
          received: 0,
        };
        break;
      }
      case 'file-chunk': {
        const buf = fileBufferRef.current[parsed.transferId];
        if (!buf) return;
        buf.chunks[parsed.chunkIndex] = parsed.data;
        buf.received += 1;
        if (buf.received === buf.meta.totalChunks) {
          const blob = reassembleFile(buf.chunks, buf.meta.mimeType);
          const url = URL.createObjectURL(blob);
          const msg = {
            id: buf.meta.transferId,
            type: 'file',
            fileName: buf.meta.fileName,
            fileSize: buf.meta.fileSize,
            mimeType: buf.meta.mimeType,
            url,
            isImage: buf.meta.mimeType.startsWith('image/'),
            isVideo: buf.meta.mimeType.startsWith('video/'),
            isSent: false,
            timestamp: Date.now(),
            status: 'received',
          };

          addMessageRef.current(buf.meta.senderId, msg);
          triggerNotificationRef.current('📎 File received', buf.meta.fileName);
          delete fileBufferRef.current[parsed.transferId];
        }
        break;
      }
      default:
        break;
    }
  }, []);

  // ── Destroy current peer ──────────────────────────────────────────────────────
  const destroyPeer = useCallback(() => {
    if (peerRef.current) {
      try {
        peerRef.current.removeAllListeners(); // prevent false-positive error/close events
        peerRef.current.destroy();
      } catch {}
      peerRef.current = null;
      setIsConnected(false);
    }
  }, [peerRef]);

  // ── Attach standard peer event handlers ──────────────────────────────────────
  const attachPeerEvents = useCallback(
    (peer, peerSocketId, peerUserId) => {
      peer.on('connect', () => {
        console.log('[WebRTC] DataChannel open — P2P established');
        setIsConnected(true);
        setConnectionStatusRef.current(peerUserId || peerSocketId, 'connected');
        addNotificationRef.current('🔗 Peer connection established', 'success');
      });

      peer.on('data', (rawData) => handleIncomingData(rawData, peerUserId));

      peer.on('stream', (remoteStream) => {
        setCallStateRef.current({ remoteStream });
      });

      peer.on('error', (err) => {
        const msg = err.message || String(err);
        // Ignore intentional teardown noise from SimplePeer
        if (msg.includes('User-Initiated Abort') || msg.includes('Close called')) return;
        console.error('[WebRTC] Peer error:', msg);
        setIsConnected(false);
        setConnectionStatusRef.current(peerUserId || peerSocketId, 'disconnected');
        addNotificationRef.current('⚠️ Connection lost. Click the user to reconnect.', 'error');
      });

      peer.on('close', () => {
        console.log('[WebRTC] Peer connection closed');
        setIsConnected(false);
        setConnectionStatusRef.current(peerUserId || peerSocketId, 'disconnected');
        peerRef.current = null;
      });
    },
    [peerRef, handleIncomingData]
  );

  // ── Create peer (initiator side) ─────────────────────────────────────────────
  const createPeer = useCallback(
    ({ initiator, peerSocketId, peerUserId, stream = null }) => {
      destroyPeer();

      const peer = new SimplePeer({
        initiator,
        trickle: true,
        stream: stream || undefined,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      peerRef.current = peer;

      // Signal routing
      peer.on('signal', (data) => {
        const sk = socketRef.current;
        if (!sk) return;
        if (data.type === 'offer') {
          sk.emit('offer', { to: peerSocketId, offer: data });
        } else if (data.type === 'answer') {
          sk.emit('answer', { to: peerSocketId, answer: data });
        } else {
          sk.emit('ice-candidate', { to: peerSocketId, candidate: data });
        }
      });

      attachPeerEvents(peer, peerSocketId, peerUserId);
      return peer;
    },
    [peerRef, destroyPeer, attachPeerEvents]
  );

  // ── Socket signaling listeners ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onOffer = ({ from, fromUserId, offer }) => {
      setConnectionStatusRef.current(fromUserId, 'connecting');
      const peer = createPeer({ initiator: false, peerSocketId: from, peerUserId: fromUserId });
      peer.signal(offer);
    };

    const onAnswer = ({ answer }) => {
      if (peerRef.current) peerRef.current.signal(answer);
    };

    const onIceCandidate = ({ candidate }) => {
      if (peerRef.current) peerRef.current.signal(candidate);
    };

    const onTyping = ({ from, isTyping }) => {
      setTyping(from, isTyping);
      if (typingTimeoutRef.current[from]) clearTimeout(typingTimeoutRef.current[from]);
      if (isTyping) {
        typingTimeoutRef.current[from] = setTimeout(() => setTyping(from, false), 3000);
      }
    };

    const onPeerUnavailable = () => {
      addNotificationRef.current('User is unavailable', 'error');
    };

    socket.on('offer', onOffer);
    socket.on('answer', onAnswer);
    socket.on('ice-candidate', onIceCandidate);
    socket.on('typing', onTyping);
    socket.on('peer-unavailable', onPeerUnavailable);

    return () => {
      socket.off('offer', onOffer);
      socket.off('answer', onAnswer);
      socket.off('ice-candidate', onIceCandidate);
      socket.off('typing', onTyping);
      socket.off('peer-unavailable', onPeerUnavailable);
    };
  }, [socket, createPeer, peerRef, setTyping]);

  // ── Initiate connection ───────────────────────────────────────────────────────
  const connectToPeer = useCallback(
    (peerSocketId, peerUserId) => {
      setConnectionStatusRef.current(peerUserId, 'connecting');
      createPeer({ initiator: true, peerSocketId, peerUserId });
    },
    [createPeer]
  );

  // ── Send raw data ─────────────────────────────────────────────────────────────
  const sendData = useCallback(
    (payload) => {
      if (!peerRef.current?.connected) return false;
      try {
        peerRef.current.send(JSON.stringify(payload));
        return true;
      } catch (err) {
        console.error('[WebRTC] send error:', err);
        return false;
      }
    },
    [peerRef]
  );

  // ── Send text message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    ({ text, messageId }) => {
      return sendData({
        type: 'text',
        id: messageId,
        senderId: currentUserRef.current?.userId,
        text,
        timestamp: Date.now(),
      });
    },
    [sendData]
  );

  // ── Send file (chunked) ───────────────────────────────────────────────────────
  const sendFile = useCallback(
    async ({ file, onProgress }) => {
      if (!peerRef.current?.connected) return false;
      const transferId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const chunks = await chunkFile(file, CHUNK_SIZE);

      sendData({
        type: 'file-meta',
        transferId,
        senderId: currentUserRef.current?.userId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        totalChunks: chunks.length,
      });

      // Backpressure: wait if DataChannel buffer is getting full
      const waitForDrain = () =>
        new Promise((resolve) => {
          const check = () => {
            const buffered = peerRef.current?._channel?.bufferedAmount ?? 0;
            if (buffered < 64 * 1024) {
              resolve();
            } else {
              setTimeout(check, 10);
            }
          };
          check();
        });

      for (let i = 0; i < chunks.length; i++) {
        if (!peerRef.current?.connected) return false; // abort if disconnected
        await waitForDrain();
        sendData({ type: 'file-chunk', transferId, chunkIndex: i, data: chunks[i] });
        onProgress?.((((i + 1) / chunks.length) * 100).toFixed(0));
        // Yield to event loop every 5 chunks to keep UI responsive
        if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      return true;
    },
    [peerRef, sendData]
  );


  return {
    connectToPeer,
    destroyPeer,
    sendMessage,
    sendFile,
    sendData,
    isConnected,
  };
}
