"""
FixFirstAI - Configuration File
================================
Central configuration for backend, database, security, and AI classification.
"""

import os
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, "fixfirst.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

# ---------------------------------------------------------------------------
# Server Ports & Environment Overrides
# ---------------------------------------------------------------------------
BACKEND_PORT = int(os.getenv("PORT", os.getenv("BACKEND_PORT", 8001)))
FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", 5174))

# ---------------------------------------------------------------------------
# Security & Authentication Settings
# ---------------------------------------------------------------------------
SECRET_KEY = os.getenv("SECRET_KEY", "fixfirst-ai-smart-campus-secret-key-2026-v2")
TOKEN_EXPIRATION_MINUTES = int(os.getenv("TOKEN_EXPIRATION_MINUTES", 60 * 24))  # 24 hours

# Role-Based Access Control Roles
USER_ROLES = ["student", "warden", "worker", "admin"]

# Campus Areas for maintenance assignment and coverage
CAMPUS_AREAS = [
    "Hostel Block A",
    "Hostel Block B",
    "Hostel Block C",
    "Academic Block 1",
    "Academic Block 2",
    "Central Library",
    "Student Activity Center (SAC)",
    "Dining Hall / Mess",
    "Sports Complex",
    "Faculty Housing",
    "Main Administration",
]

# ---------------------------------------------------------------------------
# AI Settings — OpenAI (primary), Gemini (fallback), Ollama Cloud, Local Ollama
# ---------------------------------------------------------------------------
# Options: "openai" | "gemini" | "ollama_cloud" | "ollama_local"
AI_PROVIDER = os.getenv("AI_PROVIDER", "openai").lower()

# OpenAI settings (primary AI provider)
# IMPORTANT: OPENAI_API_KEY must be set via environment variable — never hardcode here.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")  # Set via Render/Vercel env
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1")

# Gemini settings (fallback)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Ollama Cloud settings
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY")
OLLAMA_CLOUD_ENDPOINT = os.getenv("OLLAMA_CLOUD_ENDPOINT", "https://ollama.com/api/chat")

# Ollama settings (Local / Cloud Model)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "gemma4:31b" if os.getenv("AI_PROVIDER", "").lower() == "ollama_cloud" else "qwen2.5-coder:7b"
)

# Candidate model placeholder for testing pipeline
CANDIDATE_MODEL_NAME = "google/flan-t5-base"

# ---------------------------------------------------------------------------
# File-upload constraints
# ---------------------------------------------------------------------------
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB for high-res repair photos
ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"]

# ---------------------------------------------------------------------------
# Standard 10 Campus Maintenance Categories
# ---------------------------------------------------------------------------
CATEGORIES = [
    "Electrical",
    "Plumbing",
    "Hygiene & Sanitation",
    "Civil Infrastructure",
    "Furniture",
    "Fire Safety",
    "Security",
    "IT & Networking",
    "HVAC & Ventilation",
    "Other Maintenance",
]

# Priority definitions with standard campus codes
PRIORITY_LEVELS = {
    "P1 – Critical": {"code": "P1", "severity": "Critical", "sla_hours": 2},
    "P2 – High": {"code": "P2", "severity": "High", "sla_hours": 8},
    "P3 – Medium": {"code": "P3", "severity": "Medium", "sla_hours": 24},
    "P4 – Low": {"code": "P4", "severity": "Low", "sla_hours": 72},
}

# Standard department mapping for categories
CATEGORY_DEPARTMENTS = {
    "Electrical": "Electrical Maintenance",
    "Plumbing": "Plumbing & Sanitation Department",
    "Hygiene & Sanitation": "Housekeeping & Hygiene Operations",
    "Civil Infrastructure": "Estate & Civil Works",
    "Furniture": "General Facilities & Carpentry",
    "Fire Safety": "Fire & Safety Response Cell",
    "Security": "Campus Security & Surveillance",
    "IT & Networking": "IT & Campus Network Center",
    "HVAC & Ventilation": "HVAC & Climate Control Division",
    "Other Maintenance": "General Maintenance Services",
}
