import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useRef,
} from 'react';

// ─── State shape ─────────────────────────────────────────────────────────────
// ─── Restore session from localStorage ──────────────────────────────────────
function getInitialUser() {
  try {
    const username = localStorage.getItem('chat_username');
    const userId = localStorage.getItem('chat_user_id');
    if (username && userId) return { userId, username };
  } catch (_) {}
  return null;
}

const initialState = {
  currentUser: getInitialUser(), // { userId, username }
  onlineUsers: [],             // [{ userId, username, socketId }]
  activePeer: null,            // { userId, username, socketId }
  messages: {},                // { [peerUserId]: Message[] }
  unreadCounts: {},            // { [peerUserId]: number }
  typingUsers: {},             // { [peerSocketId]: boolean }
  connectionStatus: {},        // { [peerUserId]: 'connecting'|'connected'|'disconnected' }
  callState: {
    active: false,
    type: null,                // 'audio'|'video'
    peerId: null,
    peerUsername: null,
    peerSocketId: null,
    incoming: false,
    incomingOffer: null,
    minimized: false,
    localStream: null,
    remoteStream: null,
  },
  notifications: [],           // [{ id, message, type }]
};

// ─── Actions ──────────────────────────────────────────────────────────────────
const A = {
  SET_CURRENT_USER: 'SET_CURRENT_USER',
  SET_ONLINE_USERS: 'SET_ONLINE_USERS',
  ADD_ONLINE_USER: 'ADD_ONLINE_USER',
  REMOVE_ONLINE_USER: 'REMOVE_ONLINE_USER',
  SET_ACTIVE_PEER: 'SET_ACTIVE_PEER',
  ADD_MESSAGE: 'ADD_MESSAGE',
  UPDATE_MESSAGE_STATUS: 'UPDATE_MESSAGE_STATUS',
  CLEAR_UNREAD: 'CLEAR_UNREAD',
  SET_TYPING: 'SET_TYPING',
  SET_CONNECTION_STATUS: 'SET_CONNECTION_STATUS',
  SET_CALL_STATE: 'SET_CALL_STATE',
  END_CALL: 'END_CALL',
  ADD_NOTIFICATION: 'ADD_NOTIFICATION',
  REMOVE_NOTIFICATION: 'REMOVE_NOTIFICATION',
};

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, { type, payload }) {
  switch (type) {
    case A.SET_CURRENT_USER:
      return { ...state, currentUser: payload };

    case A.SET_ONLINE_USERS:
      return { ...state, onlineUsers: payload };

    case A.ADD_ONLINE_USER: {
      const exists = state.onlineUsers.some((u) => u.userId === payload.userId);
      if (exists) {
        // Update socketId if user reconnected
        return {
          ...state,
          onlineUsers: state.onlineUsers.map((u) =>
            u.userId === payload.userId ? { ...u, socketId: payload.socketId } : u
          ),
        };
      }
      return { ...state, onlineUsers: [...state.onlineUsers, payload] };
    }

    case A.REMOVE_ONLINE_USER:
      return {
        ...state,
        onlineUsers: state.onlineUsers.filter((u) => u.socketId !== payload.socketId),
      };

    case A.SET_ACTIVE_PEER:
      return {
        ...state,
        activePeer: payload,
        unreadCounts: payload
          ? { ...state.unreadCounts, [payload.userId]: 0 }
          : state.unreadCounts,
      };

    case A.ADD_MESSAGE: {
      const { peerId, message } = payload;
      const existing = state.messages[peerId] || [];
      return {
        ...state,
        messages: {
          ...state.messages,
          [peerId]: [...existing, message],
        },
        unreadCounts:
          state.activePeer?.userId !== peerId && !message.isSent
            ? {
                ...state.unreadCounts,
                [peerId]: (state.unreadCounts[peerId] || 0) + 1,
              }
            : state.unreadCounts,
      };
    }

    case A.UPDATE_MESSAGE_STATUS: {
      const { peerId, messageId, status } = payload;
      const msgs = (state.messages[peerId] || []).map((m) =>
        m.id === messageId ? { ...m, status } : m
      );
      return { ...state, messages: { ...state.messages, [peerId]: msgs } };
    }

    case A.CLEAR_UNREAD:
      return {
        ...state,
        unreadCounts: { ...state.unreadCounts, [payload]: 0 },
      };

    case A.SET_TYPING:
      return {
        ...state,
        typingUsers: { ...state.typingUsers, [payload.socketId]: payload.isTyping },
      };

    case A.SET_CONNECTION_STATUS:
      return {
        ...state,
        connectionStatus: {
          ...state.connectionStatus,
          [payload.peerId]: payload.status,
        },
      };

    case A.SET_CALL_STATE:
      return { ...state, callState: { ...state.callState, ...payload } };

    case A.END_CALL:
      return {
        ...state,
        callState: {
          ...initialState.callState,
        },
      };

    case A.ADD_NOTIFICATION: {
      const notif = { id: Date.now() + Math.random(), ...payload };
      return { ...state, notifications: [...state.notifications.slice(-4), notif] };
    }

    case A.REMOVE_NOTIFICATION:
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== payload),
      };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const peerRef = useRef(null); // holds the SimplePeer instance

  // ── Actions ─────────────────────────────────────────────────────────────────
  const setCurrentUser = useCallback(
    (user) => dispatch({ type: A.SET_CURRENT_USER, payload: user }),
    []
  );

  const setOnlineUsers = useCallback(
    (users) => dispatch({ type: A.SET_ONLINE_USERS, payload: users }),
    []
  );

  const addOnlineUser = useCallback(
    (user) => dispatch({ type: A.ADD_ONLINE_USER, payload: user }),
    []
  );

  const removeOnlineUser = useCallback(
    (socketId) => dispatch({ type: A.REMOVE_ONLINE_USER, payload: { socketId } }),
    []
  );

  const setActivePeer = useCallback(
    (peer) => dispatch({ type: A.SET_ACTIVE_PEER, payload: peer }),
    []
  );

  const addMessage = useCallback(
    (peerId, message) => dispatch({ type: A.ADD_MESSAGE, payload: { peerId, message } }),
    []
  );

  const updateMessageStatus = useCallback(
    (peerId, messageId, status) =>
      dispatch({ type: A.UPDATE_MESSAGE_STATUS, payload: { peerId, messageId, status } }),
    []
  );

  const clearUnread = useCallback(
    (peerId) => dispatch({ type: A.CLEAR_UNREAD, payload: peerId }),
    []
  );

  const setTyping = useCallback(
    (socketId, isTyping) => dispatch({ type: A.SET_TYPING, payload: { socketId, isTyping } }),
    []
  );

  const setConnectionStatus = useCallback(
    (peerId, status) =>
      dispatch({ type: A.SET_CONNECTION_STATUS, payload: { peerId, status } }),
    []
  );

  const setCallState = useCallback(
    (partial) => dispatch({ type: A.SET_CALL_STATE, payload: partial }),
    []
  );

  const endCall = useCallback(() => dispatch({ type: A.END_CALL }), []);

  const addNotification = useCallback(
    (message, type = 'info') =>
      dispatch({ type: A.ADD_NOTIFICATION, payload: { message, type } }),
    []
  );

  const removeNotification = useCallback(
    (id) => dispatch({ type: A.REMOVE_NOTIFICATION, payload: id }),
    []
  );

  return (
    <ChatContext.Provider
      value={{
        ...state,
        peerRef,
        setCurrentUser,
        setOnlineUsers,
        addOnlineUser,
        removeOnlineUser,
        setActivePeer,
        addMessage,
        updateMessageStatus,
        clearUnread,
        setTyping,
        setConnectionStatus,
        setCallState,
        endCall,
        addNotification,
        removeNotification,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
