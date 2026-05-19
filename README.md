# P2P Chat App — Complete Setup & Documentation

## 🗂 Project Structure

```
d:\chatApplication\
├── backend\
│   ├── server.js          ← Express + Socket.IO signaling server
│   ├── package.json
│   └── .env
└── frontend\
    ├── index.html
    ├── vite.config.js
    ├── package.json
    ├── .env
    └── src\
        ├── main.jsx
        ├── App.jsx + App.css
        ├── index.css            ← Global design tokens & animations
        ├── context\
        │   ├── SocketContext.jsx
        │   └── ChatContext.jsx
        ├── hooks\
        │   ├── usePeer.js       ← WebRTC + SimplePeer core logic
        │   ├── useNotification.js
        │   └── useMediaDevices.js
        ├── components\
        │   ├── Login\
        │   ├── Sidebar\
        │   ├── ChatArea\
        │   ├── MessageBubble\
        │   ├── VideoCall\
        │   └── Notifications\
        └── utils\
            ├── sanitize.js
            ├── fileUtils.js
            └── soundUtils.js
```

---

## ⚡ Quick Start

### 1. Install & Start Backend

```powershell
cd d:\chatApplication\backend
npm install
npm run dev          # dev (nodemon)
# or
node server.js       # production
```

> Runs on **http://localhost:5000**

### 2. Install & Start Frontend

```powershell
cd d:\chatApplication\frontend
npm install
npm run dev
```

> Runs on **http://localhost:5173**

### 3. Test P2P Chat

1. Open **two browser tabs** (or different browsers) at `http://localhost:5173`
2. Log in as two different users (e.g. `Alice` and `Bob`)
3. Click the other user's name in the sidebar
4. The WebRTC DataChannel establishes automatically
5. Send messages — they travel **directly P2P**, never through the backend

---

## 🔧 Environment Variables

### Backend (`backend/.env`)
| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Server port |
| `CLIENT_URL` | `http://localhost:5173` | Frontend origin for CORS |
| `NODE_ENV` | `development` | Environment |

### Frontend (`frontend/.env`)
| Variable | Default | Description |
|---|---|---|
| `VITE_SERVER_URL` | `http://localhost:5000` | Backend signaling server URL |

---

## 🌐 WebRTC Signaling Flow

```
Alice (initiator)                 Server              Bob (receiver)
      │                              │                      │
      │── user-online ──────────────►│                      │
      │                              │◄────── user-online ──│
      │                              │                      │
      │    (Alice clicks Bob)        │                      │
      │── offer (SDP) ─────────────►│──── offer ──────────►│
      │                              │                      │ (createPeer, initiator=false)
      │                              │◄─── answer ──────────│
      │◄── answer ──────────────────│                      │
      │                              │                      │
      │◄──── ice-candidate ─────────►│ (both sides, trickle)│
      │                              │                      │
      │════════════════ WebRTC DataChannel (P2P) ═══════════│
      │                                                      │
      │──────────── text / file / call (no server) ────────►│
```

**Key principle**: The signaling server only brokers the SDP negotiation. Once the DataChannel is open, **zero bytes of chat data pass through the backend**.

---

## ✨ Features

| Feature | Implementation |
|---|---|
| Username login | localStorage + UUID |
| Online presence | Socket.IO `user-online` / `user-left` |
| P2P messaging | SimplePeer DataChannel |
| File sharing | Chunked ArrayBuffer (16 KB chunks) |
| Image preview | `URL.createObjectURL` |
| Emoji picker | `emoji-picker-element` web component |
| Typing indicator | Debounced Socket.IO `typing` event |
| Audio calling | SimplePeer with `getUserMedia(audio)` |
| Video calling | SimplePeer with `getUserMedia(video+audio)` |
| Mic/camera toggle | `MediaStreamTrack.enabled` |
| Call minimize | Absolute-positioned mini window |
| Notifications | Web Notifications API + Web Audio beep |
| Message copy | `navigator.clipboard.writeText` |
| Drag-drop files | `onDrop` on chat area |
| XSS protection | DOMPurify on all received messages |
| Dark glassmorphism UI | CSS variables + `backdrop-filter` |

---

## 🚀 Production Deployment

### Backend (e.g. Railway, Render, Fly.io)

1. Set env vars: `PORT`, `CLIENT_URL` (your Vercel/Netlify frontend URL)
2. Start command: `node server.js`

### Frontend (e.g. Vercel, Netlify)

1. Build: `npm run build` → deploys `dist/` folder
2. Set env var: `VITE_SERVER_URL=https://your-backend-url.com`

### Important: HTTPS required for WebRTC in production

WebRTC and `getUserMedia` require **HTTPS** in production. Use platforms that provide it automatically (Render, Railway, Vercel all do).

---

## 🐛 Troubleshooting

| Issue | Fix |
|---|---|
| "Peer connection failed" | Check STUN servers; try behind VPN |
| No camera/mic access | Ensure HTTPS or localhost; check browser permissions |
| Socket not connecting | Verify `VITE_SERVER_URL` and CORS `CLIENT_URL` match |
| Messages not sending | Ensure DataChannel is open (header shows "🔗 P2P connected") |
| File transfer stalls | Reduce chunk size or check DataChannel buffer |
