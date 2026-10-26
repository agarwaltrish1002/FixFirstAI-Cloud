# 🛡️ FixFirst AI

### Intelligent Campus Risk & Maintenance Agent

> An AI-powered campus maintenance and safety complaint prioritization system that helps organize complaints, identify urgent safety issues, and generate actionable maintenance tickets.

![Status](https://img.shields.io/badge/Status-Hackathon%20Demo-green)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![AI](https://img.shields.io/badge/AI-Qwen3%201.7B-orange)

---

## 📋 Table of Contents

1. [Problem Statement](#-problem-statement)
2. [Solution](#-solution)
3. [Features](#-features)
4. [Technology Stack](#-technology-stack)
5. [AI Model Details](#-ai-model-details)
6. [Project Structure](#-project-structure)
7. [Installation](#-installation)
8. [How to Start](#-how-to-start)
9. [How to Stop](#-how-to-stop)
10. [How to Install AI Model](#-how-to-install-ai-model)
11. [Troubleshooting](#-troubleshooting)
12. [Limitations](#-limitations)
13. [Demo Workflow](#-demo-workflow)
14. [Graphify](#-graphify)
15. [Team](#-team)

---

## 🎯 Problem Statement

College students and staff regularly report maintenance issues such as:

- ⚡ Exposed electrical wires
- 💧 Water leakage
- 🪑 Broken furniture
- 🚪 Blocked emergency exits
- 💡 Broken lights
- 🚰 Drinking water problems

**The Problem:** Complaints are registered, but maintenance teams don't know which issues should be addressed **first**. A broken chair and an exposed electrical wire might get the same treatment time, even though the wire is a safety hazard.

## 💡 Solution

**FixFirst AI** combines:

1. **AI-powered analysis** (Qwen3 1.7B via Ollama) to understand and categorize complaints
2. **Rule-based Safety Engine** to ensure critical safety hazards are always prioritized correctly
3. **Smart Dashboard** to visualize and manage all complaints
4. **Maintenance Ticket Generation** to create actionable tickets for maintenance teams

The AI analyzes each complaint and suggests a priority, but a **separate rule-based safety engine** ensures that genuinely dangerous situations (exposed wires, blocked exits) are **always** classified as Critical — even if the AI model suggests otherwise.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📊 **Dashboard** | Overview of all complaints with stats, priority distribution, and recent activity |
| 📝 **Submit Complaint** | Easy form to report campus issues with image upload |
| 🤖 **AI Analysis** | Automatic complaint analysis using a local AI model |
| 🛡️ **Safety Priority Engine** | Rule-based system that ensures critical hazards get top priority |
| 📋 **Complaint Management** | View, search, filter, sort, and update complaint statuses |
| 🎫 **Maintenance Tickets** | Generate printable maintenance tickets from complaints |
| 💬 **Priority Explanation** | Clear explanation of why each complaint received its priority |
| 🔄 **Fallback Mode** | Works even without AI model — uses rule-based analysis as fallback |

---

## 🛠️ Technology Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES6 Modules) |
| **Dev Server** | Vite |
| **Backend** | Python, FastAPI |
| **Database** | SQLite |
| **AI Runtime** | Ollama (local inference) |
| **AI Model** | Qwen3 1.7B (open-weight, Apache 2.0 license) |
| **HTTP Server** | Uvicorn (ASGI) |

---

## 🤖 AI Model Details

| Property | Value |
|----------|-------|
| **Model** | Qwen3 1.7B |
| **Developer** | Alibaba Cloud (Qwen Team) |
| **License** | Apache 2.0 |
| **Parameters** | 1.7 Billion |
| **Runtime** | Ollama (local, no cloud API needed) |
| **RAM Required** | ~2-3 GB for inference |
| **Hardware Tested** | AMD Ryzen 7 8840HS, 24GB RAM, Integrated AMD Radeon |

### How the AI is Used

1. When a complaint is submitted, the AI model reads the title and description
2. It generates a structured JSON analysis including: category, summary, risk indicators, suggested priority, explanation, recommended department, and suggested action
3. The **Safety Priority Engine** then reviews the AI's suggestion
4. If the complaint contains critical safety keywords (electrical, blocked exit, etc.), the engine **overrides** the AI to ensure Critical priority
5. The final priority and its explanation are shown to the user

### Important Notes

- The AI model runs **locally** on your machine — no data is sent to the cloud
- If Ollama is not installed, the system automatically falls back to **rule-based analysis**
- The AI does **not** make final safety decisions — the rule-based engine has override authority
- This is a **demo project** — the AI analysis is for demonstration purposes

---

## 📁 Project Structure

```
FixFirstAI/
├── backend/
│   ├── __init__.py          # Python package marker
│   ├── config.py            # Configuration (ports, paths, model)
│   ├── database.py          # SQLite database setup & demo data
│   ├── safety_engine.py     # Rule-based safety priority engine
│   ├── ai_service.py        # Ollama AI integration
│   ├── main.py              # FastAPI application & API routes
│   └── uploads/             # Uploaded complaint images
├── frontend/
│   ├── index.html           # Main HTML page (SPA)
│   ├── css/
│   │   └── style.css        # Complete stylesheet
│   ├── js/
│   │   ├── api.js           # API communication layer
│   │   ├── app.js           # Main application logic & router
│   │   ├── dashboard.js     # Dashboard page
│   │   ├── complaints.js    # Complaints list & detail
│   │   ├── submit.js        # Submit complaint form
│   │   ├── tickets.js       # Maintenance tickets
│   │   └── ai-status.js     # AI status & health check
│   ├── package.json         # Frontend dependencies
│   └── vite.config.js       # Vite configuration
├── run_backend.py           # Backend startup script
├── start_fixfirst.bat       # One-click Windows launcher
├── stop_fixfirst.bat        # Safe shutdown script
├── requirements.txt         # Python dependencies
├── .gitignore               # Git ignore rules
├── LICENSE                  # MIT License
└── README.md                # This file
```

---

## 📦 Installation

### Prerequisites

You need these installed on your Windows PC:

1. **Python 3.10+** — [Download from python.org](https://www.python.org/downloads/)
   - ⚠️ During installation, check **"Add Python to PATH"**
2. **Node.js 18+** — [Download from nodejs.org](https://nodejs.org/)
   - Choose the LTS version

### Step-by-Step Installation

1. **Open a terminal** (Command Prompt or PowerShell)

2. **Navigate to the project folder:**
   ```
   cd C:\Users\YourUsername\OneDrive\Desktop\lmniit\FixFirstAI
   ```

3. **Create a Python virtual environment:**
   ```
   python -m venv venv
   ```

4. **Activate the virtual environment:**
   ```
   venv\Scripts\activate
   ```

5. **Install Python packages:**
   ```
   pip install -r requirements.txt
   ```

6. **Install frontend packages:**
   ```
   cd frontend
   npm install
   cd ..
   ```

7. **Done!** You're ready to start.

---

## 🚀 How to Start

### Easy Way (Recommended)

**Double-click `start_fixfirst.bat`**

This will:
1. ✅ Check Python and Node.js
2. ✅ Set up the virtual environment
3. ✅ Install dependencies
4. ✅ Start the backend server
5. ✅ Start the frontend server
6. ✅ Open the website in your browser

### Manual Way

Open **two separate terminals**:

**Terminal 1 — Backend:**
```
cd C:\path\to\FixFirstAI
venv\Scripts\activate
python run_backend.py
```

**Terminal 2 — Frontend:**
```
cd C:\path\to\FixFirstAI\frontend
npx vite --port 5174
```

### Website URL

Open your browser and go to:

```
http://127.0.0.1:5174
```

| Service | URL |
|---------|-----|
| Frontend (Website) | http://127.0.0.1:5174 |
| Backend (API) | http://127.0.0.1:8001 |

---

## 🛑 How to Stop

### Easy Way

**Double-click `stop_fixfirst.bat`**

### Manual Way

Close both terminal windows (Backend and Frontend).

> ⚠️ This will NOT stop your other projects. Only FixFirst AI servers are stopped.

---

## 🤖 How to Install AI Model

The AI features are **optional**. The app works without them using rule-based analysis.

### Step 1: Install Ollama

1. Go to [https://ollama.com](https://ollama.com)
2. Click **Download for Windows**
3. Run the installer
4. Ollama will start automatically

### Step 2: Download the AI Model

Open a terminal and run:

```
ollama pull qwen3:1.7b
```

This will download the Qwen3 1.7B model (~1.5 GB download).

### Step 3: Verify

1. Make sure Ollama is running (check system tray)
2. Start FixFirst AI
3. Go to the **AI Status** page in the dashboard
4. You should see a green "Connected" indicator

---

## 🔧 Troubleshooting

### "Python is not installed"
- Install Python from [python.org](https://www.python.org/downloads/)
- ⚠️ Make sure to check **"Add Python to PATH"** during installation
- Restart your terminal after installation

### "Node.js is not installed"
- Install Node.js from [nodejs.org](https://nodejs.org/)
- Choose the **LTS** version
- Restart your terminal after installation

### "Port already in use"
- The startup script automatically tries alternative ports
- If port 5174 is busy, it tries 5175, then 5176
- If port 8001 is busy, it tries 8002, then 8003

### "Backend not connecting"
- Make sure the backend terminal shows "Uvicorn running on http://127.0.0.1:8001"
- Check if another application is using port 8001
- Try running `python run_backend.py` manually to see error messages

### "AI features not working"
- This is expected if Ollama is not installed
- The app uses rule-based analysis as a fallback
- To enable AI: install Ollama and run `ollama pull qwen3:1.7b`

### "npm install fails"
- Make sure Node.js is installed: `node --version`
- Try deleting `frontend/node_modules` and running `npm install` again
- Make sure you're inside the `frontend` folder

---

## ⚠️ Limitations

This is a **hackathon demo project**. Please note:

1. **Not production-ready** — This is a prototype for demonstration purposes
2. **No real notifications** — Maintenance tickets are generated locally; no real department is contacted
3. **No authentication** — There is no login system; anyone can access the dashboard
4. **AI accuracy** — The AI model (1.7B parameters) may not always give perfect analysis
5. **Safety disclaimer** — This system does NOT guarantee safety. For real emergencies, contact campus security directly
6. **Local only** — The application runs on localhost and is not deployed to the internet
7. **Demo data** — Sample complaints use fictional data; no real student information is used
8. **SQLite** — The database is suitable for demos but not for high-traffic production use

---

## 🎮 Demo Workflow

Here's how to demonstrate FixFirst AI to hackathon judges:

### 1. Show the Dashboard
- Point out the stats cards (Total, Critical, High, Pending)
- Show the demo complaints already loaded
- Highlight the priority distribution

### 2. Submit a New Complaint
- Click "Submit Complaint" in the sidebar
- Fill in: Location = "Main Building", Room = "102"
- Title: "Exposed electrical wire hanging from ceiling"
- Description: "There is a bare electrical wire hanging from the ceiling near the entrance. Students are walking under it."
- Category: "Electrical Safety"
- Submit and watch it get analyzed

### 3. Show AI Analysis
- Click on the complaint to see its details
- Show the AI analysis (or fallback rule-based analysis)
- Point out the "Why this priority?" explanation
- Show the safety warning for Critical complaints

### 4. Generate a Maintenance Ticket
- Click "Generate Ticket" on the complaint
- Show the ticket with all details
- Click "Print Ticket" to demonstrate
- Point out the demo disclaimer

### 5. Show the Safety Engine
- Explain how the rule-based engine overrides AI for safety
- Show that "Exposed electrical wire" is always Critical
- Show that the explanation distinguishes AI vs rule-based decisions

### 6. Show AI Status
- Navigate to AI Status page
- Show whether Ollama is connected
- Explain the fallback mechanism

---

## 📊 Graphify

This project is prepared for Graphify code analysis.

### If Graphify is installed:

```bash
cd FixFirstAI
graphify analyze .
```

### If Graphify is not installed:

1. Check the hackathon documentation for Graphify installation instructions
2. Typically: `pip install graphify` or `npm install -g graphify`
3. Run the analysis command from the project root
4. Output will be saved in the project folder

---

## 👥 Team

**FixFirst AI** — Built for the Open Source AI Hackathon 2026

- Built with ❤️ by CSE Cybersecurity students at LNMIIT

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

The Qwen3 model is licensed under Apache 2.0 by Alibaba Cloud.
