require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const PORT = process.env.PORT || 5000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── In-memory user store ─────────────────────────────────────────────────────
// Map<socketId, { userId, username, socketId }>
const connectedUsers = new Map();

// Helper: build the public users list (excluding a specific socketId)
function getUsersList(excludeSocketId = null) {
  const list = [];
  connectedUsers.forEach((user, sid) => {
    if (sid !== excludeSocketId) {
      list.push({ userId: user.userId, username: user.username, socketId: sid });
    }
  });
  return list;
}

// ─── REST health check ────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', connectedUsers: connectedUsers.size });
});

// ─── Socket.IO events ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // ── user-online ─────────────────────────────────────────────────────────────
  socket.on('user-online', ({ userId, username }) => {
    // Validate
    if (!userId || !username || typeof username !== 'string') {
      socket.emit('error', { message: 'Invalid user data' });
      return;
    }

    // Prevent duplicate connections for same userId (clean up old socket)
    connectedUsers.forEach((user, sid) => {
      if (user.userId === userId && sid !== socket.id) {
        connectedUsers.delete(sid);
        const oldSocket = io.sockets.sockets.get(sid);
        if (oldSocket) oldSocket.disconnect(true);
      }
    });

    connectedUsers.set(socket.id, {
      userId,
      username: username.trim().substring(0, 30),
      socketId: socket.id,
    });

    console.log(`[+] User online: ${username} (${userId})`);

    // Send the current users list back to the joining user
    socket.emit('users-list', getUsersList(socket.id));

    // Broadcast new user to everyone else
    socket.broadcast.emit('user-joined', {
      userId,
      username,
      socketId: socket.id,
    });
  });

  // ── WebRTC Signaling: offer ──────────────────────────────────────────────────
  socket.on('offer', ({ to, offer }) => {
    const sender = connectedUsers.get(socket.id);
    if (!sender || !to || !offer) return;

    const targetSocket = io.sockets.sockets.get(to);
    if (!targetSocket) {
      socket.emit('peer-unavailable', { to });
      return;
    }

    targetSocket.emit('offer', {
      from: socket.id,
      fromUserId: sender.userId,
      fromUsername: sender.username,
      offer,
    });
  });

  // ── WebRTC Signaling: answer ─────────────────────────────────────────────────
  socket.on('answer', ({ to, answer }) => {
    const sender = connectedUsers.get(socket.id);
    if (!sender || !to || !answer) return;

    const targetSocket = io.sockets.sockets.get(to);
    if (!targetSocket) return;

    targetSocket.emit('answer', {
      from: socket.id,
      answer,
    });
  });

  // ── WebRTC Signaling: ice-candidate ──────────────────────────────────────────
  socket.on('ice-candidate', ({ to, candidate }) => {
    if (!to || !candidate) return;

    const targetSocket = io.sockets.sockets.get(to);
    if (!targetSocket) return;

    targetSocket.emit('ice-candidate', {
      from: socket.id,
      candidate,
    });
  });

  // ── Typing indicator ─────────────────────────────────────────────────────────
  socket.on('typing', ({ to, isTyping }) => {
    const sender = connectedUsers.get(socket.id);
    if (!sender || !to) return;

    const targetSocket = io.sockets.sockets.get(to);
    if (!targetSocket) return;

    targetSocket.emit('typing', {
      from: socket.id,
      fromUsername: sender.username,
      isTyping: Boolean(isTyping),
    });
  });

  // ── Call signaling ───────────────────────────────────────────────────────────
  socket.on('call-offer', ({ to, callOffer, callType }) => {
    const sender = connectedUsers.get(socket.id);
    if (!sender || !to) return;

    const targetSocket = io.sockets.sockets.get(to);
    if (!targetSocket) {
      socket.emit('peer-unavailable', { to });
      return;
    }

    targetSocket.emit('call-offer', {
      from: socket.id,
      fromUsername: sender.username,
      callOffer,
      callType, // 'audio' | 'video'
    });
  });

  socket.on('call-answer', ({ to, callAnswer }) => {
    const targetSocket = io.sockets.sockets.get(to);
    if (!targetSocket) return;
    targetSocket.emit('call-answer', { from: socket.id, callAnswer });
  });

  socket.on('call-ice-candidate', ({ to, candidate }) => {
    const targetSocket = io.sockets.sockets.get(to);
    if (!targetSocket) return;
    targetSocket.emit('call-ice-candidate', { from: socket.id, candidate });
  });

  socket.on('call-ended', ({ to }) => {
    const targetSocket = io.sockets.sockets.get(to);
    if (!targetSocket) return;
    targetSocket.emit('call-ended', { from: socket.id });
  });

  socket.on('call-rejected', ({ to }) => {
    const targetSocket = io.sockets.sockets.get(to);
    if (!targetSocket) return;
    targetSocket.emit('call-rejected', { from: socket.id });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      console.log(`[-] User offline: ${user.username} (${user.userId}) — ${reason}`);
      connectedUsers.delete(socket.id);

      // Notify everyone that this user left
      socket.broadcast.emit('user-left', {
        userId: user.userId,
        socketId: socket.id,
      });
    }
    console.log(`[-] Socket disconnected: ${socket.id}`);
  });

  socket.on('error', (err) => {
    console.error(`[!] Socket error (${socket.id}):`, err.message);
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀 Signaling server running on http://localhost:${PORT}`);
  console.log(`   Client origin: ${CLIENT_URL}\n`);
});
