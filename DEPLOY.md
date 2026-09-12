# Coolify Deployment Guide

Two Docker applications on Coolify: **backend** (API + WebSocket) and **frontend** (Next.js).

---

## Prerequisites

- Coolify instance running (self-hosted or cloud)
- Git repo connected to Coolify (GitHub/GitLab)
- A domain with DNS pointing to your Coolify server

---

## Step 1: Deploy Backend

### 1.1 Create Application

In Coolify dashboard:
1. **New Application** → **Git-based** → select your repo
2. **Branch:** `coolify-deploy`
3. **Build Pack:** Dockerfile
4. **Base Directory:** `/backend`
5. **Dockerfile Location:** `Dockerfile` (auto-detected)

### 1.2 Configure

| Setting | Value |
|---|---|
| Name | `solace-backend` |
| Port | `8080` |
| Health Check Path | `/` |

### 1.3 Environment Variables

Set these in **Configuration → Environment Variables**:

```
PORT=8080
NODE_ENV=production
CLIENT_ORIGIN=https://YOUR-FRONTEND-DOMAIN.com
TURN_HOST=YOUR-TURN-HOST (or leave default for coturn)
TURN_PORT=3478
TURN_USER=solace
TURN_PASSWORD=CHANGE-THIS
TURN_REALM=solace.local
```

### 1.4 Domain

Add a domain in **Configuration → Domains**:
```
https://api.solace.yourdomain.com
```

### 1.5 Persistent Storage

The uploads directory needs persistence. In **Configuration → Persistent Storage**:
- Mount: `/app/uploads` (named volume or host path)

### 1.6 Deploy

Click **Deploy**. Wait for build + health check to pass.

---

## Step 2: Deploy Frontend

### 2.1 Create Application

1. **New Application** → **Git-based** → select your repo
2. **Branch:** `coolify-deploy`
3. **Build Pack:** Dockerfile
4. **Base Directory:** `/frontend`
5. **Dockerfile Location:** `Dockerfile`

### 2.2 Configure

| Setting | Value |
|---|---|
| Name | `solace-frontend` |
| Port | `3000` |
| Health Check Path | `/` |

### 2.3 Environment Variables

**Critical:** `NEXT_PUBLIC_BACKEND_URL` is baked at build time. It MUST be set as both a **Docker build arg** AND an **environment variable**.

In **Configuration → Environment Variables**:
```
PORT=3000
HOSTNAME=0.0.0.0
NEXT_PUBLIC_BACKEND_URL=https://api.solace.yourdomain.com
```

In **Configuration → General → Build Arguments** (or Advanced → Docker Build Args):
```
NEXT_PUBLIC_BACKEND_URL=https://api.solace.yourdomain.com
```

> ⚠️ The build arg value must match the env var value exactly. If you change the backend domain later, you must **rebuild** the frontend (not just restart).

### 2.4 Domain

Add a domain in **Configuration → Domains**:
```
https://solace.yourdomain.com
```

### 2.5 Deploy

Click **Deploy**. Wait for build + health check.

---

## Step 3: Update Backend CORS

After the frontend is deployed and you have its domain:

1. Go to **solace-backend** → **Configuration → Environment Variables**
2. Update `CLIENT_ORIGIN` to match your frontend domain exactly:
   ```
   CLIENT_ORIGIN=https://solace.yourdomain.com
   ```
3. **Redeploy** the backend

---

## Step 4: Verify

1. Open `https://solace.yourdomain.com`
2. You should see the Solace join screen
3. Create a room → verify the room loads
4. Open a second tab → join the same room
5. Test: wallpaper change, chat, timer, playback

---

## Environment Variables Reference

### Backend

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `8080` | Server listen port |
| `CLIENT_ORIGIN` | **Yes** | `http://localhost:3000` | Frontend origin for CORS. Must match frontend domain exactly. |
| `TURN_HOST` | No | `localhost` | TURN server hostname for WebRTC |
| `TURN_PORT` | No | `3478` | TURN server port |
| `TURN_USER` | No | `solace` | TURN credentials username |
| `TURN_PASSWORD` | No | `changeme` | TURN credentials password |
| `TURN_REALM` | No | `solace.local` | TURN realm |

### Frontend

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | **Yes** | `http://localhost:8000` | Backend URL. **Baked at build time** — must set as Docker build arg too. |
| `PORT` | No | `3000` | Next.js server port |
| `HOSTNAME` | No | `0.0.0.0` | Bind address |

---

## Troubleshooting

### Frontend can't connect to backend
- Check `NEXT_PUBLIC_BACKEND_URL` matches the backend domain exactly (no trailing slash)
- Check backend `CLIENT_ORIGIN` matches the frontend domain exactly
- Check browser console for CORS errors
- **Remember:** changing `NEXT_PUBLIC_BACKEND_URL` requires a full rebuild, not just restart

### WebSocket not connecting
- Socket.io uses WebSocket upgrade — ensure your Coolify reverse proxy supports it
- Check that the backend port (8080) is correctly exposed

### Uploads disappearing
- Ensure `/app/uploads` has persistent storage mounted in Coolify
- Backend wipes uploads on boot if the directory is ephemeral

### Health check failing
- Backend: check logs for startup errors, ensure `PORT` is set
- Frontend: check logs for build errors, ensure `NEXT_PUBLIC_BACKEND_URL` is set at build time

---

## Architecture

```
Browser → solace.yourdomain.com (Coolify proxy → frontend:3000)
            ↕ WebSocket
        api.solace.yourdomain.com (Coolify proxy → backend:8080)
            ↕ WebRTC (peer-to-peer via coturn if needed)
```

Both services sit behind Coolify's built-in reverse proxy (Traefik). WebSocket upgrade is handled automatically.

---

## Updates

To deploy new code:
1. Push to the `coolify-deploy` branch
2. Coolify auto-detects the push (if webhook configured) or manually trigger deploy
3. If `NEXT_PUBLIC_BACKEND_URL` changed: update build args in frontend config, then redeploy

---

## Local Development

```bash
# Copy env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# Start everything
docker compose up --build

# Frontend: http://localhost:3000
# Backend: http://localhost:8080
```
