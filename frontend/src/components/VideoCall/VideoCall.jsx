import { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import { useChat } from '../../context/ChatContext';
import { useSocket } from '../../context/SocketContext';
import { useMediaDevices, getMediaErrorMessage } from '../../hooks/useMediaDevices';
import { playCallRingSound } from '../../utils/soundUtils';
import './VideoCall.css';

// Timer only ticks when `connected` is true (remote peer accepted the call)
function useCallTimer(connected) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!connected) { setSeconds(0); return; }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [connected]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function VideoCall() {
  const { callState, setCallState, endCall, activePeer } = useChat();
  const { socket } = useSocket();
  const { getStream, stopStream, toggleTrack, localStreamRef } = useMediaDevices();

  const [micMuted, setMicMuted]           = useState(false);
  const [camOff, setCamOff]               = useState(false);
  const [minimized, setMinimized]         = useState(false);
  const [mediaError, setMediaError]       = useState(null);
  // True only after remote stream arrives (peer actually accepted & WebRTC connected)
  const [callConnected, setCallConnected] = useState(false);

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const callPeerRef    = useRef(null);

  // Timer ticks only after call is truly connected (remote stream received)
  const timer = useCallTimer(callConnected);

  const peerSocketId = callState.peerSocketId || activePeer?.socketId;

  // ── Attach streams to video elements ─────────────────────────────────────────
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [callState.active, callConnected, localStreamRef]);

  useEffect(() => {
    if (remoteVideoRef.current && callState.remoteStream) {
      remoteVideoRef.current.srcObject = callState.remoteStream;
    }
  }, [callState.remoteStream]);

  // ── Listen for socket call events ─────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onCallOffer = ({ from, fromUsername, callOffer, callType }) => {
      playCallRingSound();
      setCallState({
        incoming: true,
        peerSocketId: from,
        peerUsername: fromUsername,
        type: callType,
        incomingOffer: callOffer,
      });
    };

    const onCallAnswer = ({ callAnswer }) => {
      if (callPeerRef.current) callPeerRef.current.signal(callAnswer);
    };

    const onCallIce = ({ candidate }) => {
      if (callPeerRef.current) callPeerRef.current.signal(candidate);
    };

    const onCallEnded = () => {
      hangUp();
    };

    const onCallRejected = () => {
      endCall();
      stopStream();
      setCallConnected(false);
      if (callPeerRef.current) { callPeerRef.current.destroy(); callPeerRef.current = null; }
    };

    socket.on('call-offer', onCallOffer);
    socket.on('call-answer', onCallAnswer);
    socket.on('call-ice-candidate', onCallIce);
    socket.on('call-ended', onCallEnded);
    socket.on('call-rejected', onCallRejected);

    return () => {
      socket.off('call-offer', onCallOffer);
      socket.off('call-answer', onCallAnswer);
      socket.off('call-ice-candidate', onCallIce);
      socket.off('call-ended', onCallEnded);
      socket.off('call-rejected', onCallRejected);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // ── Initiate call ─────────────────────────────────────────────────────────────
  const startCall = async () => {
    const isVideo = callState.type === 'video';
    let stream;
    try {
      stream = await getStream({ video: isVideo, audio: true });
    } catch (err) {
      setMediaError(getMediaErrorMessage(err));
      endCall();
      return;
    }

    // Mark call as active but NOT yet connected — shows "Ringing…" UI
    setCallState({ active: true, localStream: stream });
    setCallConnected(false);

    const peer = new SimplePeer({
      initiator: true,
      trickle: true,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    callPeerRef.current = peer;

    peer.on('signal', (data) => {
      if (data.type === 'offer') {
        socket.emit('call-offer', {
          to: peerSocketId,
          callOffer: data,
          callType: callState.type,
        });
      } else if (data.type === 'answer') {
        socket.emit('call-answer', { to: peerSocketId, callAnswer: data });
      } else {
        socket.emit('call-ice-candidate', { to: peerSocketId, candidate: data });
      }
    });

    peer.on('stream', (remoteStream) => {
      // Remote peer accepted — NOW start the timer and show the call UI
      setCallConnected(true);
      setCallState({ remoteStream });
    });

    peer.on('error', (err) => {
      console.error('[Call] Peer error:', err);
      hangUp();
    });

    peer.on('close', () => hangUp());
  };

  // ── Accept incoming call ──────────────────────────────────────────────────────
  const acceptCall = async () => {
    const isVideo = callState.type === 'video';
    let stream;
    try {
      stream = await getStream({ video: isVideo, audio: true });
    } catch (err) {
      setMediaError(getMediaErrorMessage(err));
      socket.emit('call-rejected', { to: callState.peerSocketId });
      endCall();
      return;
    }

    setCallState({ active: true, incoming: false, localStream: stream });

    const peer = new SimplePeer({
      initiator: false,
      trickle: true,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    callPeerRef.current = peer;
    peer.signal(callState.incomingOffer);

    peer.on('signal', (data) => {
      if (data.type === 'answer') {
        socket.emit('call-answer', { to: callState.peerSocketId, callAnswer: data });
      } else {
        socket.emit('call-ice-candidate', { to: callState.peerSocketId, candidate: data });
      }
    });

    peer.on('stream', (remoteStream) => {
      // Connection fully established — start timer for callee too
      setCallConnected(true);
      setCallState({ remoteStream });
    });

    peer.on('error', () => hangUp());
    peer.on('close', () => hangUp());
  };

  // ── Hang up ───────────────────────────────────────────────────────────────────
  const hangUp = () => {
    if (peerSocketId) socket.emit('call-ended', { to: peerSocketId });
    stopStream();
    if (callPeerRef.current) { callPeerRef.current.destroy(); callPeerRef.current = null; }
    endCall();
    setCallConnected(false);
    setMicMuted(false);
    setCamOff(false);
    setMinimized(false);
  };

  const rejectCall = () => {
    socket.emit('call-rejected', { to: callState.peerSocketId });
    endCall();
  };

  const toggleMic = () => {
    toggleTrack('audio');
    setMicMuted((v) => !v);
  };

  const toggleCam = () => {
    toggleTrack('video');
    setCamOff((v) => !v);
  };

  // ── Start call effect (when callState.type set but not yet active) ────────────
  useEffect(() => {
    if (callState.type && !callState.active && !callState.incoming) {
      startCall();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState.type]);

  // ── Incoming call UI ──────────────────────────────────────────────────────────
  if (callState.incoming && !callState.active) {
    return (
      <div className="video-call-backdrop">
        <div className="incoming-call-card" role="dialog" aria-label="Incoming call">
          <div className="incoming-avatar">
            {callState.peerUsername?.[0]?.toUpperCase() || '?'}
          </div>
          <h3>{callState.peerUsername}</h3>
          <p>Incoming {callState.type === 'video' ? '📹 video' : '📞 audio'} call…</p>
          <div className="incoming-call-actions">
            <button
              id="btn-accept-call"
              className="btn-accept-call"
              onClick={acceptCall}
              title="Accept"
            >
              📞
              <span className="btn-label">Accept</span>
            </button>
            <button
              id="btn-reject-call"
              className="btn-reject-call"
              onClick={rejectCall}
              title="Decline"
            >
              📵
              <span className="btn-label">Decline</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Ringing UI (caller waiting for remote to pick up) ─────────────────────────
  if (callState.active && !callConnected) {
    return (
      <div className="video-call-backdrop">
        <div className="incoming-call-card ringing-card" role="dialog" aria-label="Calling">
          <div className="incoming-avatar ringing-avatar">
            {callState.peerUsername?.[0]?.toUpperCase() || '?'}
            <div className="ring-wave ring-wave-1" />
            <div className="ring-wave ring-wave-2" />
            <div className="ring-wave ring-wave-3" />
          </div>
          <h3>{callState.peerUsername || activePeer?.username}</h3>
          <p className="ringing-label">
            {callState.type === 'video' ? '📹' : '📞'} Ringing…
          </p>
          <button
            id="btn-cancel-call"
            className="btn-reject-call btn-cancel-call"
            onClick={hangUp}
            title="Cancel call"
          >
            📵
            <span className="btn-label">Cancel</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Active call UI (call connected, timer running) ────────────────────────────
  if (callState.active && callConnected) {
    return (
      <div className={`video-call-modal ${minimized ? 'minimized' : 'maximized'}`}>
        <div className="video-area">
          {callState.type === 'video' ? (
            <>
              <video
                ref={remoteVideoRef}
                className="remote-video"
                autoPlay
                playsInline
                id="remote-video"
              />
              <video
                ref={localVideoRef}
                className="local-video"
                autoPlay
                playsInline
                muted
                id="local-video"
              />
            </>
          ) : (
            <div className="call-no-video">
              <div className="call-no-video-avatar">
                {callState.peerUsername?.[0]?.toUpperCase() || '?'}
              </div>
              <p>{callState.peerUsername || 'Peer'}</p>
            </div>
          )}

          {/* Header overlay */}
          {!minimized && (
            <div className="call-header">
              <div className="call-header-info">
                <h3>{callState.peerUsername || activePeer?.username}</h3>
                <p>{callState.type === 'video' ? 'Video call' : 'Audio call'}</p>
              </div>
              <span className="call-timer">{timer}</span>
              <button
                className="btn-minimize"
                onClick={() => setMinimized(true)}
                title="Minimize"
              >
                ⊟ Minimize
              </button>
            </div>
          )}
        </div>

        {!minimized && (
          <div className="call-controls">
            <button
              id="btn-toggle-mic"
              className={`call-ctrl-btn ${micMuted ? 'muted' : ''}`}
              onClick={toggleMic}
              title={micMuted ? 'Unmute' : 'Mute'}
            >
              {micMuted ? '🎤🚫' : '🎤'}
              <span className="ctrl-label">{micMuted ? 'Unmuted' : 'Mute'}</span>
            </button>

            {callState.type === 'video' && (
              <button
                id="btn-toggle-cam"
                className={`call-ctrl-btn ${camOff ? 'cam-off' : ''}`}
                onClick={toggleCam}
                title={camOff ? 'Enable camera' : 'Disable camera'}
              >
                {camOff ? '📷🚫' : '📷'}
                <span className="ctrl-label">{camOff ? 'Cam on' : 'Cam off'}</span>
              </button>
            )}

            <button
              id="btn-end-call"
              className="btn-end-call"
              onClick={hangUp}
              title="End call"
            >
              📵
            </button>
          </div>
        )}

        {minimized && (
          <button
            style={{
              position: 'absolute',
              bottom: '0.5rem',
              right: '0.5rem',
              background: 'var(--danger)',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              width: '36px',
              height: '36px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
            onClick={hangUp}
          >
            📵
          </button>
        )}
        {minimized && (
          <button
            style={{
              position: 'absolute',
              top: '0.5rem',
              right: '0.5rem',
              background: 'rgba(0,0,0,0.5)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: 'white',
              cursor: 'pointer',
              padding: '0.2rem 0.4rem',
              fontSize: '0.7rem',
            }}
            onClick={() => setMinimized(false)}
          >
            ⊞
          </button>
        )}
      </div>
    );
  }

  // ── Media error card ──────────────────────────────────────────────────────────
  if (mediaError) {
    return (
      <div className="video-call-backdrop">
        <div className="incoming-call-card" role="alert" style={{ maxWidth: 420 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎥⚠️</div>
          <h3 style={{ marginBottom: '0.75rem', color: 'var(--danger)' }}>
            Camera / Microphone Error
          </h3>
          <p style={{
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            textAlign: 'left',
            whiteSpace: 'pre-line',
            lineHeight: 1.6,
            marginBottom: '1.25rem',
          }}>
            {mediaError}
          </p>
          <button
            className="btn-login"
            onClick={() => setMediaError(null)}
            style={{ width: '100%' }}
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  return null;
}
