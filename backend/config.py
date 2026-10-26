"""
FixFirstAI - Configuration File
================================
Central configuration for the backend server, database, file uploads, and AI service.
"""

import os

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# Base directory of the backend package
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# SQLite database file – stored right inside the backend folder
DATABASE_PATH = os.path.join(BASE_DIR, "fixfirst.db")

# Uploaded images folder
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

# ---------------------------------------------------------------------------
# Server ports & Environment Overrides
# ---------------------------------------------------------------------------
BACKEND_PORT = int(os.getenv("PORT", os.getenv("BACKEND_PORT", 8001)))
FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", 5174))

# ---------------------------------------------------------------------------
# Ollama (local AI) settings
# ---------------------------------------------------------------------------
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:7b")

# ---------------------------------------------------------------------------
# File-upload constraints
# ---------------------------------------------------------------------------
MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"]

# ---------------------------------------------------------------------------
# Complaint categories the front-end can choose from
# ---------------------------------------------------------------------------
CATEGORIES = [
    "Electrical Safety",
    "Water Leakage",
    "Infrastructure",
    "Emergency Exit",
    "Drinking Water",
    "Lighting",
    "Hygiene",
    "Fire Safety",
    "Pest Control",
    "Security",
    "Other",
]
