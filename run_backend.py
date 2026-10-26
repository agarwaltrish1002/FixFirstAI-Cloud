"""
FixFirstAI - Run Backend
=========================
Convenience script to start the FastAPI backend with Uvicorn.
Run this from the FixFirstAI project root:

    python run_backend.py
"""

import sys
import os

# Make sure the project root is on the Python path so that
# `from backend.xxx import yyy` works everywhere.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

import uvicorn
from backend.config import BACKEND_PORT

if __name__ == "__main__":
    print(f"\n{'=' * 50}")
    print(f"  FixFirst AI Backend")
    print(f"  Running on: http://127.0.0.1:{BACKEND_PORT}")
    print(f"{'=' * 50}\n")
    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",
        port=BACKEND_PORT,
        reload=True,
    )
