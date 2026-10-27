"""
FixFirstAI - Main FastAPI Application
=======================================
This is the entry-point for the backend server.  It wires up:
  • Database initialisation & demo seeding
  • CORS for the React frontend on port 5174
  • RESTful API routes for complaints, tickets, uploads, and AI status
  • Input validation & sanitisation via Pydantic models
  • Parameterised SQL queries everywhere (no SQL injection)
"""

import html
import json
import os
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

from backend.config import (
    BACKEND_PORT,
    FRONTEND_PORT,
    UPLOAD_DIR,
    MAX_UPLOAD_SIZE,
    ALLOWED_EXTENSIONS,
    CATEGORIES,
)
from backend.database import init_db, seed_demo_data, get_db, _next_complaint_id, _next_ticket_id
from backend.safety_engine import analyze_complaint as rule_analyze, override_priority
from backend.ai_service import (
    check_ollama_available,
    check_model_available,
    analyze_with_ai,
    get_fallback_analysis,
)
from backend.analytics_engine import (
    compute_campus_risk_intelligence,
    calculate_sla_target,
    get_sla_status,
)

# ---------------------------------------------------------------------------
# App initialisation (lifespan replaces deprecated on_event)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(application):
    """Runs once when the server starts."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    init_db()
    seed_demo_data()
    print("  [OK] Database initialised and demo data seeded.")
    yield

app = FastAPI(
    title="FixFirstAI API",
    description="AI-powered campus maintenance & safety complaint prioritisation",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow Vite dev server and configurable deployed frontend origins
allowed_origins = [
f"[http://127.0.0.1:{FRONTEND_PORT](http://127.0.0.1:{FRONTEND_PORT)}",
f"http://localhost:{FRONTEND_PORT}",
"https://fix-first-ai-cloud-9so6w00j9-syzygy7.vercel.app",
]

extra_origins = os.getenv("ALLOWED_ORIGINS", "")
if extra_origins:
    allowed_origins.extend([origin.strip() for origin in extra_origins.split(",") if origin.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic models (request / response validation)
# ---------------------------------------------------------------------------

def _sanitise(value: str) -> str:
    """Strip HTML tags and escape special characters."""
    # Remove HTML tags
    clean = re.sub(r"<[^>]+>", "", value)
    # Escape remaining HTML entities
    return html.escape(clean.strip())


class ComplaintCreate(BaseModel):
    """Payload for creating a new complaint."""
    student_name: str = Field(..., min_length=2, max_length=100)
    location: str = Field(..., min_length=2, max_length=200)
    room_number: Optional[str] = Field(default="", max_length=50)
    title: str = Field(..., min_length=5, max_length=200)
    description: str = Field(..., min_length=10, max_length=2000)
    category: str
    image_path: Optional[str] = None

    # Sanitise all text fields automatically
    @field_validator("student_name", "location", "room_number", "title", "description", mode="before")
    @classmethod
    def sanitise_text(cls, v: str) -> str:
        if isinstance(v, str):
            return _sanitise(v)
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in CATEGORIES:
            raise ValueError(f"Invalid category. Must be one of: {', '.join(CATEGORIES)}")
        return v


class StatusUpdate(BaseModel):
    """Payload for updating a complaint's status."""
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed = {"Pending", "Assigned", "In Progress", "Resolved"}
        if v not in allowed:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(allowed)}")
        return v


class TicketCreate(BaseModel):
    """Payload for generating a ticket from a complaint."""
    complaint_id: str


class ComplaintPreview(BaseModel):
    """Payload for real-time pre-submission risk preview."""
    title: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=2000)
    category: Optional[str] = None


class TicketResolve(BaseModel):
    """Payload for completing/resolving a maintenance ticket."""
    technician_name: str = Field(..., min_length=2, max_length=100)
    root_cause: str = Field(..., min_length=5, max_length=500)
    preventive_action: str = Field(..., min_length=5, max_length=500)
    safety_signoff: bool = True
    status: str = Field(default="Resolved & Verified")


# ---------------------------------------------------------------------------
# Helper: convert sqlite3.Row to plain dict
# ---------------------------------------------------------------------------

def _row_to_dict(row) -> dict[str, Any]:
    """Convert a sqlite3.Row to a normal dict, parsing JSON fields."""
    d = dict(row)
    # Parse ai_analysis JSON string into a real object
    if d.get("ai_analysis"):
        try:
            d["ai_analysis"] = json.loads(d["ai_analysis"])
        except (json.JSONDecodeError, TypeError):
            pass
    return d


# ═══════════════════════════════════════════════════════════════════════════
# API ROUTES
# ═══════════════════════════════════════════════════════════════════════════


# ── Health & Status ────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    """Basic health check — also reports Ollama availability."""
    ollama_ok = await check_ollama_available()
    return {
        "status": "healthy",
        "ollama_available": ollama_ok,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/ai/status")
async def ai_status():
    """Detailed AI readiness check."""
    ollama_ok = await check_ollama_available()
    model_ok = await check_model_available() if ollama_ok else False
    return {
        "ollama_available": ollama_ok,
        "model_loaded": model_ok,
        "model_name": "qwen2.5-coder:7b",
    }


# ── Dashboard Stats ───────────────────────────────────────────────────────

@app.get("/api/stats")
async def get_stats():
    """Return aggregate counts for the dashboard cards."""
    conn = get_db()
    try:
        total     = conn.execute("SELECT COUNT(*) AS c FROM complaints").fetchone()["c"]
        critical  = conn.execute("SELECT COUNT(*) AS c FROM complaints WHERE priority = ?", ("Critical",)).fetchone()["c"]
        high      = conn.execute("SELECT COUNT(*) AS c FROM complaints WHERE priority = ?", ("High",)).fetchone()["c"]
        pending   = conn.execute("SELECT COUNT(*) AS c FROM complaints WHERE status = ?", ("Pending",)).fetchone()["c"]
        resolved  = conn.execute("SELECT COUNT(*) AS c FROM complaints WHERE status = ?", ("Resolved",)).fetchone()["c"]
        return {
            "total": total,
            "critical": critical,
            "high": high,
            "pending": pending,
            "resolved": resolved,
        }
    finally:
        conn.close()


# ── Categories ─────────────────────────────────────────────────────────────

@app.get("/api/categories")
async def list_categories():
    """Return the list of allowed complaint categories."""
    return {"categories": CATEGORIES}


# ── Complaints CRUD ───────────────────────────────────────────────────────

@app.get("/api/complaints")
async def list_complaints(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("date"),      # "date" | "priority"
    order: Optional[str] = Query("desc"),          # "asc" | "desc"
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List complaints with optional filtering, sorting, and pagination."""
    conn = get_db()
    try:
        clauses: list[str] = []
        params: list[Any] = []

        if status:
            clauses.append("status = ?")
            params.append(status)
        if priority:
            clauses.append("priority = ?")
            params.append(priority)
        if category:
            clauses.append("category = ?")
            params.append(category)
        if search:
            clauses.append("(title LIKE ? OR description LIKE ? OR location LIKE ?)")
            like = f"%{search}%"
            params.extend([like, like, like])

        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""

        # Sorting
        priority_order = (
            "CASE priority "
            "WHEN 'Critical' THEN 0 "
            "WHEN 'High' THEN 1 "
            "WHEN 'Medium' THEN 2 "
            "WHEN 'Low' THEN 3 "
            "ELSE 4 END"
        )

        if sort_by == "priority":
            order_clause = f"{priority_order} {'DESC' if order == 'desc' else 'ASC'}"
        else:
            order_clause = f"created_at {'DESC' if order == 'desc' else 'ASC'}"

        # Count (for pagination metadata)
        count_row = conn.execute(
            f"SELECT COUNT(*) AS c FROM complaints{where}", params
        ).fetchone()
        total = count_row["c"]

        # Fetch page
        offset = (page - 1) * per_page
        rows = conn.execute(
            f"SELECT * FROM complaints{where} ORDER BY {order_clause} LIMIT ? OFFSET ?",
            params + [per_page, offset],
        ).fetchall()

        return {
            "complaints": [_row_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": max(1, -(-total // per_page)),  # ceil division
        }
    finally:
        conn.close()


@app.get("/api/complaints/{complaint_id}")
async def get_complaint(complaint_id: str):
    """Get a single complaint by ID."""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM complaints WHERE id = ?", (complaint_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Complaint not found")
        return _row_to_dict(row)
    finally:
        conn.close()


@app.post("/api/complaints", status_code=201)
async def create_complaint(data: ComplaintCreate):
    """
    Submit a new complaint.
    1. Validate & sanitise input (done by Pydantic).
    2. Run the rule-based safety engine.
    3. Attempt AI analysis via Ollama (fall back to rules if unavailable).
    4. Merge priorities (rule engine can override AI if Critical).
    5. Save to database and return the complaint with analysis.
    """
    conn = get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        complaint_id = _next_complaint_id(conn)

        # ── Step 1: Rule-based analysis ─────────────────────────────────
        rule_result = rule_analyze(data.title, data.description, data.category)

        # ── Step 2: AI analysis (may be None) ───────────────────────────
        ai_result = None
        try:
            ai_result = await analyze_with_ai(data.title, data.description, data.category)
        except Exception:
            pass  # never crash on AI failure

        # ── Step 3: Merge priorities ────────────────────────────────────
        if ai_result:
            merged = override_priority(
                ai_priority=ai_result["suggested_priority"],
                rule_priority=rule_result["priority"],
                rule_reason=rule_result["reason"],
            )
            final_priority = merged["final_priority"]
            priority_reason = merged["explanation"]
            # Combine AI + rule analyses into one JSON blob
            analysis_blob = {
                **ai_result,
                "rule_engine": rule_result,
                "priority_override": merged,
            }
        else:
            # No AI → use rule engine only
            final_priority = rule_result["priority"]
            priority_reason = rule_result["reason"]
            fallback = get_fallback_analysis(
                data.title, data.description, data.category, rule_result
            )
            analysis_blob = {
                **fallback,
                "rule_engine": rule_result,
            }

        # ── Step 4: Persist to database ─────────────────────────────────
        conn.execute(
            """
            INSERT INTO complaints
                (id, student_name, location, room_number, title, description,
                 category, image_path, status, priority, priority_reason,
                 ai_analysis, assigned_department, created_at, updated_at,
                 is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                complaint_id,
                data.student_name,
                data.location,
                data.room_number or "",
                data.title,
                data.description,
                data.category,
                data.image_path,
                "Pending",
                final_priority,
                priority_reason,
                json.dumps(analysis_blob),
                rule_result["department"],
                now,
                now,
                0,  # not demo
            ),
        )
        conn.commit()

        # Return the newly created complaint
        row = conn.execute(
            "SELECT * FROM complaints WHERE id = ?", (complaint_id,)
        ).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


@app.put("/api/complaints/{complaint_id}/status")
async def update_complaint_status(complaint_id: str, data: StatusUpdate):
    """Update the status of an existing complaint."""
    conn = get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()

        # Check complaint exists
        existing = conn.execute(
            "SELECT id FROM complaints WHERE id = ?", (complaint_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Complaint not found")

        conn.execute(
            "UPDATE complaints SET status = ?, updated_at = ? WHERE id = ?",
            (data.status, now, complaint_id),
        )
        conn.commit()

        row = conn.execute(
            "SELECT * FROM complaints WHERE id = ?", (complaint_id,)
        ).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


@app.delete("/api/complaints/demo")
async def reset_demo_data():
    """Delete all demo complaints and re-seed them."""
    conn = get_db()
    try:
        # Delete tickets linked to demo complaints first
        conn.execute(
            "DELETE FROM tickets WHERE complaint_id IN "
            "(SELECT id FROM complaints WHERE is_demo = 1)"
        )
        conn.execute("DELETE FROM complaints WHERE is_demo = 1")
        conn.commit()
    finally:
        conn.close()

    # Re-seed
    seed_demo_data()
    return {"message": "Demo data has been reset successfully."}


@app.post("/api/complaints/{complaint_id}/analyze")
async def reanalyze_complaint(complaint_id: str):
    """Re-run AI + rule-engine analysis on an existing complaint."""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM complaints WHERE id = ?", (complaint_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Complaint not found")

        complaint = dict(row)
        title = complaint["title"]
        description = complaint["description"]
        category = complaint["category"]

        # Rule engine
        rule_result = rule_analyze(title, description, category)

        # AI
        ai_result = None
        try:
            ai_result = await analyze_with_ai(title, description, category)
        except Exception:
            pass

        # Merge
        if ai_result:
            merged = override_priority(
                ai_priority=ai_result["suggested_priority"],
                rule_priority=rule_result["priority"],
                rule_reason=rule_result["reason"],
            )
            final_priority = merged["final_priority"]
            priority_reason = merged["explanation"]
            analysis_blob = {
                **ai_result,
                "rule_engine": rule_result,
                "priority_override": merged,
            }
        else:
            final_priority = rule_result["priority"]
            priority_reason = rule_result["reason"]
            fallback = get_fallback_analysis(title, description, category, rule_result)
            analysis_blob = {**fallback, "rule_engine": rule_result}

        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            UPDATE complaints
            SET priority = ?, priority_reason = ?, ai_analysis = ?,
                assigned_department = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                final_priority,
                priority_reason,
                json.dumps(analysis_blob),
                rule_result["department"],
                now,
                complaint_id,
            ),
        )
        conn.commit()

        updated = conn.execute(
            "SELECT * FROM complaints WHERE id = ?", (complaint_id,)
        ).fetchone()
        return _row_to_dict(updated)
    finally:
        conn.close()


# ── Campus Intelligence & Pre-Submission Safety Preview ────────────────────

@app.get("/api/analytics/risk-index")
async def get_campus_risk_intelligence():
    """Returns comprehensive proactive campus risk analytics, building scorecards, and advisories."""
    conn = get_db()
    try:
        return compute_campus_risk_intelligence(conn)
    finally:
        conn.close()


@app.post("/api/complaints/preview")
async def preview_complaint_risk(data: ComplaintPreview):
    """Provides instantaneous pre-submission safety warnings and predicted priority as students type."""
    text_sample = f"{data.title} {data.description}".strip()
    if len(text_sample) < 3:
        return {
            "predicted_priority": "Normal",
            "safety_warning": None,
            "immediate_advice": "Describe the location and issue clearly.",
            "is_critical": False,
        }

    rule_result = rule_analyze(data.title, data.description, data.category or "Other")
    is_critical = rule_result.get("priority") == "Critical"

    if is_critical:
        immediate_advice = "[SAFETY ALERT] Potential emergency hazard. Stay at least 5 meters away and do NOT touch anything."
    elif rule_result.get("priority") == "High":
        immediate_advice = "[Caution] Please warn others nearby and avoid the immediate area."
    else:
        immediate_advice = "Standard maintenance review will be scheduled."

    return {
        "predicted_priority": rule_result.get("priority"),
        "predicted_department": rule_result.get("department"),
        "safety_warning": rule_result.get("safety_warning"),
        "immediate_advice": immediate_advice,
        "is_critical": is_critical,
        "priority_reason": rule_result.get("reason"),
    }


# ── Tickets ────────────────────────────────────────────────────────────────

@app.get("/api/tickets")
async def list_tickets():
    """Return all tickets with real-time SLA metrics."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM tickets ORDER BY created_at DESC"
        ).fetchall()
        tickets = []
        for r in rows:
            td = dict(r)
            td["sla_status"] = get_sla_status(
                td["created_at"], td["priority"], td["status"], td.get("resolved_at")
            )
            tickets.append(td)
        return {"tickets": tickets}
    finally:
        conn.close()


@app.get("/api/tickets/{ticket_id}")
async def get_ticket(ticket_id: str):
    """Get a single ticket by ID with SLA metrics."""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM tickets WHERE id = ?", (ticket_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Ticket not found")
        td = dict(row)
        td["sla_status"] = get_sla_status(
            td["created_at"], td["priority"], td["status"], td.get("resolved_at")
        )
        return td
    finally:
        conn.close()


@app.post("/api/tickets", status_code=201)
async def create_ticket(data: TicketCreate):
    """Generate a maintenance ticket from an existing complaint with proactive SLA tracking."""
    conn = get_db()
    try:
        # Look up the source complaint
        row = conn.execute(
            "SELECT * FROM complaints WHERE id = ?", (data.complaint_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Complaint not found")

        complaint = _row_to_dict(row)
        now = datetime.now(timezone.utc).isoformat()
        ticket_id = _next_ticket_id(conn)
        sla_target = calculate_sla_target(now, complaint["priority"])

        # Extract recommended action from AI analysis if available
        recommended_action = "Inspect and resolve the reported issue."
        ai = complaint.get("ai_analysis")
        if isinstance(ai, dict):
            recommended_action = ai.get("suggested_action", recommended_action)

        conn.execute(
            """
            INSERT INTO tickets
                (id, complaint_id, location, issue_summary, priority,
                 priority_reason, recommended_action, department, status,
                 created_at, updated_at, sla_target_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ticket_id,
                complaint["id"],
                complaint["location"],
                complaint["title"],
                complaint["priority"],
                complaint.get("priority_reason", ""),
                recommended_action,
                complaint.get("assigned_department", "General Maintenance"),
                "Open",
                now,
                now,
                sla_target,
            ),
        )

        # Mark complaint as Assigned
        conn.execute(
            "UPDATE complaints SET status = ?, updated_at = ? WHERE id = ?",
            ("Assigned", now, complaint["id"]),
        )
        conn.commit()

        ticket_row = conn.execute(
            "SELECT * FROM tickets WHERE id = ?", (ticket_id,)
        ).fetchone()
        res = dict(ticket_row)
        res["sla_status"] = get_sla_status(res["created_at"], res["priority"], res["status"])
        return res
    finally:
        conn.close()


@app.put("/api/tickets/{ticket_id}/resolve")
async def resolve_ticket(ticket_id: str, data: TicketResolve):
    """Complete a ticket with technician notes, root cause, and safety sign-off."""
    conn = get_db()
    try:
        existing = conn.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Ticket not found")

        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            UPDATE tickets
            SET status = ?, technician_name = ?, root_cause = ?,
                preventive_action = ?, safety_signoff = ?, resolved_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                data.status,
                data.technician_name,
                data.root_cause,
                data.preventive_action,
                1 if data.safety_signoff else 0,
                now,
                now,
                ticket_id,
            ),
        )
        # Also update underlying complaint to Resolved
        conn.execute(
            "UPDATE complaints SET status = 'Resolved', updated_at = ? WHERE id = ?",
            (now, existing["complaint_id"]),
        )
        conn.commit()

        updated = conn.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        res = dict(updated)
        res["sla_status"] = get_sla_status(
            res["created_at"], res["priority"], res["status"], res.get("resolved_at")
        )
        return res
    finally:
        conn.close()


# ── File Uploads ───────────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload an image file.
    Validates file extension and size, then saves to the uploads directory.
    """
    # Validate file extension
    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Read file content and validate size
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE // (1024 * 1024)} MB.",
        )

    # Generate a unique filename to avoid collisions
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(UPLOAD_DIR, unique_name)

    with open(save_path, "wb") as f:
        f.write(content)

    return {
        "filename": unique_name,
        "path": f"/uploads/{unique_name}",
        "size": len(content),
    }


@app.get("/uploads/{filename}")
async def serve_upload(filename: str):
    """Serve an uploaded file."""
    # Sanitise: prevent path traversal
    safe_name = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_name)

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(file_path)
