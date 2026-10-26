# FixFirst AI — Project Structure

```
FixFirstAI/
├── backend/
│   ├── __init__.py            # Package marker
│   ├── config.py              # Ports, paths, model settings (qwen2.5-coder:7b)
│   ├── database.py            # SQLite setup, tables, demo data, auto-migrations
│   ├── safety_engine.py       # Deterministic keyword safety rules & AI priority overrides
│   ├── ai_service.py          # Local Ollama REST client & structured JSON validator
│   ├── analytics_engine.py    # Building Risk Index, Hazard Clusters, Preventive Advisories & SLA
│   ├── main.py                # FastAPI app, API routes, preview & ticket resolution endpoints
│   └── uploads/               # Uploaded hazard photos
├── frontend/
│   ├── index.html             # Main SPA entrypoint & navigation
│   ├── css/style.css          # Proactive campus theme & responsive styles
│   ├── js/
│   │   ├── api.js             # Backend API client functions
│   │   ├── app.js             # SPA Router, toasts, modal manager, utilities
│   │   ├── dashboard.js       # Dashboard with Proactive Hero & operational metrics
│   │   ├── risk-intelligence.js # Campus Risk Matrix, Hazard Clusters & Preventive Advisories
│   │   ├── submit.js          # Complaint form with real-time pre-submission risk preview
│   │   ├── complaints.js      # Complaints list, search, filters & detailed modal
│   │   ├── tickets.js         # Maintenance tickets, dynamic SLA tracking & digital sign-off
│   │   └── ai-status.js       # Ollama & Qwen model telemetry diagnostics
│   ├── package.json           # npm configuration (Vite dev server)
│   └── vite.config.js         # Vite configuration (port 5174)
├── venv/                      # Python virtual environment (gitignored)
├── run_backend.py             # Backend runner (port 8001)
├── start_fixfirst.bat         # Single-click launcher for Windows
├── stop_fixfirst.bat          # Safe shutdown script
├── requirements.txt           # Python dependencies
├── README.md                  # Comprehensive platform guide
├── .gitignore                 # Clean repository exclusions
├── LICENSE                    # MIT Open Source License
├── PROJECT_CONTEXT.md         # Fast-load architecture reference
├── HANDOFF.md                 # State & task transition memory
└── PROJECT_STRUCTURE.md       # This file
```
