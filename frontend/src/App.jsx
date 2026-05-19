import { useCallback, useEffect, useState } from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import { ChatProvider, useChat } from './context/ChatContext';
import { usePeer } from './hooks/usePeer';
import Login from './components/Login/Login';
import Sidebar from './components/Sidebar/Sidebar';
import ChatArea from './components/ChatArea/ChatArea';
import VideoCall from './components/VideoCall/VideoCall';
import NotificationToast from './components/Notifications/NotificationToast';
import './App.css';

// ─── Inner App (has access to contexts) ──────────────────────────────────────
function AppInner() {
  const { socket, connected } = useSocket();
  const {
    currentUser,
    setCurrentUser,
    setOnlineUsers,
    addOnlineUser,
    removeOnlineUser,
    setActivePeer,
    activePeer,
    addMessage,
    updateMessageStatus,
    setConnectionStatus,
    setCallState,
    addNotification,
  } = useChat();

  const peerActions = usePeer();

  // Mobile: track which panel is visible ('sidebar' | 'chat')
  const [mobilePanel, setMobilePanel] = useState('sidebar');

  // ── Socket presence events ───────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onUsersList = (users) => setOnlineUsers(users);

    const onUserJoined = (user) => {
      addOnlineUser(user);
      addNotification(`${user.username} joined`, 'info');
    };

    const onUserLeft = ({ userId, socketId }) => {
      removeOnlineUser(socketId);
      setConnectionStatus(userId, 'disconnected');
    };

    socket.on('users-list', onUsersList);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);

    return () => {
      socket.off('users-list', onUsersList);
      socket.off('user-joined', onUserJoined);
      socket.off('user-left', onUserLeft);
    };
  }, [socket, setOnlineUsers, addOnlineUser, removeOnlineUser, setConnectionStatus, addNotification]);

  // ── Re-announce when socket reconnects ──────────────────────────────────────
  useEffect(() => {
    if (connected && currentUser && socket) {
      socket.emit('user-online', {
        userId: currentUser.userId,
        username: currentUser.username,
      });
    }
  }, [connected, currentUser, socket]);

  // ── Select peer to chat ──────────────────────────────────────────────────────
  const handleSelectPeer = useCallback(
    (user) => {
      setActivePeer(user);
      peerActions.connectToPeer(user.socketId, user.userId);
      setMobilePanel('chat'); // switch to chat panel on mobile
    },
    [setActivePeer, peerActions]
  );

  // ── Back to sidebar (mobile) ─────────────────────────────────────────────────
  const handleBackToSidebar = useCallback(() => {
    setMobilePanel('sidebar');
  }, []);

  // ── Start call ───────────────────────────────────────────────────────────────
  const handleStartCall = useCallback(
    (callType) => {
      if (!activePeer) return;
      setCallState({
        type: callType,
        peerId: activePeer.userId,
        peerUsername: activePeer.username,
        peerSocketId: activePeer.socketId,
      });
    },
    [activePeer, setCallState]
  );

  // ── Logout ───────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    peerActions.destroyPeer();
    localStorage.removeItem('chat_username');
    localStorage.removeItem('chat_user_id');
    setCurrentUser(null);
    setActivePeer(null);
    setOnlineUsers([]);
    setMobilePanel('sidebar');
  }, [peerActions, setCurrentUser, setActivePeer, setOnlineUsers]);

  // ── Peer actions bundle (passed to ChatArea) ──────────────────────────────────
  const chatAreaPeerActions = {
    ...peerActions,
    addMessageLocal: addMessage,
    updateStatus: updateMessageStatus,
  };

  // ── Not logged in → show login ───────────────────────────────────────────────
  if (!currentUser) {
    return <Login />;
  }

  return (
    <div className="app">
      {/* Offline banner */}
      {!connected && (
        <div className="connection-bar reconnecting">
          ⟳ Reconnecting to server…
        </div>
      )}

      <div className="app-main">
        <Sidebar
          onSelectPeer={handleSelectPeer}
          onLogout={handleLogout}
          mobileHidden={mobilePanel === 'chat'}
        />
        <ChatArea
          onStartCall={handleStartCall}
          peerActions={chatAreaPeerActions}
          mobileHidden={mobilePanel === 'sidebar'}
          onBackToSidebar={handleBackToSidebar}
        />
      </div>

      {/* Overlays */}
      <VideoCall />
      <NotificationToast />
    </div>
  );
}

// ─── Root App with Providers ──────────────────────────────────────────────────
export default function App() {
  return (
    <SocketProvider>
      <ChatProvider>
        <AppInner />
      </ChatProvider>
    </SocketProvider>
  );
}
