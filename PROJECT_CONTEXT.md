# FixFirst AI — Project Context

## Platform Identity & Vision
**FixFirst AI — From Reactive Complaints to Proactive Campus Care**
A production-style AI-powered campus safety, maintenance intelligence, and risk prevention platform designed for educational institutions to identify safety risks, understand recurring infrastructure problems, prioritize maintenance, and prevent avoidable emergencies through data-driven intelligence.

## Tech Stack
- **Frontend:** Vanilla HTML5, CSS3, modern ES6+ JavaScript modules, Vite dev server
- **Backend:** Python 3.14, FastAPI, Uvicorn ASGI
- **Database:** SQLite with WAL mode (`backend/fixfirst.db`)
- **AI Engine:** Local Ollama running `qwen2.5-coder:7b` (zero-shot structured JSON inference with deterministic safety rule override)
- **Analytics Engine:** `backend/analytics_engine.py` (Building Safety Index, Hazard Clusters, Preventive Advisories, SLA enforcement)

## Ports & URLs
| Service | Port | Local URL |
| :--- | :--- | :--- |
| **Frontend Platform** | 5174 | http://localhost:5174/ |
| **Backend API** | 8001 | http://127.0.0.1:8001/api/ |
| **Ollama Local LLM** | 11434 | http://127.0.0.1:11434 |

## Proactive Features
1. **Campus Risk Intelligence & Heatmap:** Real-time 0–100 Building Safety Health Scores across monitored campus blocks.
2. **Systemic Hazard Cluster Detection:** Automated pattern recognition flagging recurring failures (e.g. 3+ electrical faults in Academic Block A) with hypothesized root causes and escalation forecasts.
3. **Preventive Maintenance Advisories:** Actionable checklists for facilities leadership to prevent emergencies before they happen.
4. **Live Pre-Submission Safety Preview:** Instant debounced safety advice & hazard warning rendered as students type in the complaint form.
5. **Dynamic SLA Tracking & Work Orders:** Real-time countdowns by severity (Critical &le; 2h, High &le; 24h, Medium &le; 48h) with digital technician resolution logging & safety sign-off.
6. **Hybrid AI & Safety Engine:** Local `qwen2.5-coder:7b` inference coupled with zero-compromise deterministic safety rule overrides for life-threatening hazards.
