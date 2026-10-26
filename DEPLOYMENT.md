# FixFirst AI Deployment Architecture & Live Production Plan

## 1. Overview
FixFirst AI consists of:
- **Frontend**: Vite + Vanilla JS ES6 modules (SPA)
- **Backend**: FastAPI + SQLite + Uvicorn
- **AI Service**: Ollama integration using `qwen2.5-coder:7b`
- **Safety Engine**: Deterministic campus safety keyword prioritisation

---

## 2. Local vs. Production Separation

| Component | Local Development | Live Production |
|---|---|---|
| **Frontend URL** | `http://localhost:5174` | `https://fixfirst-ai.vercel.app` (or custom domain) |
| **Backend API** | `http://127.0.0.1:8001` | `https://fixfirst-ai-backend.onrender.com` |
| **API Base Config** | `frontend/.env.development` | Set via Vercel env `VITE_API_BASE_URL` |
| **CORS Origins** | `localhost:5174`, `127.0.0.1:5174` | Configured via `ALLOWED_ORIGINS` in backend env |
| **Database** | `backend/fixfirst.db` (local SQLite) | Persistent Volume or Render Disk mount |
| **Ollama AI** | `http://127.0.0.1:11434` (local PC) | Dedicated Cloud GPU/VPS or fallback rules engine |

---

## 3. Deployment Steps

### Step 1: Deploy Backend (e.g. Render / Railway)
1. In Render / Railway, create a new **Web Service** pointing to your GitHub repository (subfolder `FixFirstAI`).
2. Build command:
   ```bash
   pip install -r requirements.txt
   ```
3. Start command:
   ```bash
   uvicorn backend.main:app --host 0.0.0.0 --port $PORT
   ```
4. Set Environment Variables:
   - `ALLOWED_ORIGINS`: `https://your-frontend-domain.vercel.app`
   - `OLLAMA_URL`: URL of your remote Ollama instance (if hosted), or leave empty to use rule-engine fallback.

### Step 2: Deploy Frontend (e.g. Vercel)
1. Import repository in **Vercel**.
2. Root Directory: `FixFirstAI/frontend`
3. Framework Preset: `Vite`
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Environment Variable:
   - `VITE_API_BASE_URL`: `https://your-backend.onrender.com` (from Step 1)

---

## 4. Why Local Ollama Is NOT Public
Your `qwen2.5-coder:7b` model runs locally on your PC (consuming ~4.7 GB RAM/VRAM). Deploying the frontend to the web does **not** grant the internet access to your local PC without exposing private ports or utilizing tunnels like Cloudflare Tunnels/ngrok (which require manual authorization).

When deployed without a remote GPU server:
- The backend seamlessly engages the built-in **Deterministic Safety Engine**, providing instant classification and safety advice.
- When run on your laptop, the **real local Ollama `qwen2.5-coder:7b`** executes complete LLM inference.
