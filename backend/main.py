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

from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Depends, Header, status
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
    CATEGORY_DEPARTMENTS,
    PRIORITY_LEVELS,
)
from backend.database import (
    init_db,
    seed_demo_data,
    get_db,
    _next_complaint_id,
    _next_ticket_id,
    get_user_by_username,
    get_user_by_id,
)
from backend.auth import (
    hash_password,
    verify_password,
    create_access_token,
    verify_access_token,
    get_current_user,
    get_current_user_optional,
    require_roles,
)
from backend.validation import validate_complaint_content
from backend.ranking_engine import calculate_complaint_ranking, rank_all_complaints
from backend.safety_engine import analyze_complaint as rule_analyze, override_priority
from backend.ai_service import (
    check_ollama_available,
    check_model_available,
    analyze_with_ai,
    get_fallback_analysis,
    get_ai_service_status,
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
    f"http://127.0.0.1:{FRONTEND_PORT}",
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


class LoginRequest(BaseModel):
    """Payload for user authentication."""
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=3, max_length=100)


class RecommendRequest(BaseModel):
    """Payload for pre-submission category & priority recommendation."""
    title: str = Field(..., min_length=2, max_length=200)
    description: str = Field(..., min_length=4, max_length=2000)
    location: Optional[str] = Field(default="", max_length=200)
    category: Optional[str] = None


class ComplaintCreate(BaseModel):
    """Payload for creating a new complaint."""
    student_name: Optional[str] = Field(default="", max_length=100)
    location: str = Field(..., min_length=2, max_length=200)
    room_number: Optional[str] = Field(default="", max_length=50)
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=6, max_length=2000)
    category: Optional[str] = Field(default=None)
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
    def validate_category(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in CATEGORIES:
            for cat in CATEGORIES:
                if cat.lower() in v.lower() or v.lower() in cat.lower():
                    return cat
            return "Other Maintenance"
        return v or "Other Maintenance"


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
    """Detailed AI readiness and provider status check."""
    return await get_ai_service_status()


# ── Authentication Endpoints ───────────────────────────────────────────────

@app.post("/api/auth/login")
async def login(data: LoginRequest):
    """Authenticate student, warden, or teacher with PBKDF2 password hashing."""
    user = get_user_by_username(data.username.strip().lower())
    if not user or not verify_password(data.password, user["password_hash"], user["salt"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password. Please verify your credentials.",
        )

    token = create_access_token(
        user_id=user["id"],
        username=user["username"],
        role=user["role"],
        full_name=user["full_name"],
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "full_name": user["full_name"],
            "department_or_hostel": user.get("department_or_hostel"),
        },
    }


@app.get("/api/auth/me")
async def get_my_profile(current_user: dict[str, Any] = Depends(get_current_user)):
    """Return the currently authenticated user's profile and privileges."""
    return {"user": current_user}


@app.get("/api/auth/demo-users")
async def get_demo_users():
    """Return available demo accounts for seamless one-click role switching."""
    return {
        "accounts": [
            {
                "username": "student1",
                "role": "student",
                "full_name": "Aarav Sharma",
                "label": "Student (Hostel H1 - Rm 204)",
                "password": "Student@123",
            },
            {
                "username": "student2",
                "role": "student",
                "full_name": "Diya Patel",
                "label": "Student (Hostel H2 - Rm 112)",
                "password": "Student@123",
            },
            {
                "username": "warden1",
                "role": "warden",
                "full_name": "Rajesh Kumar",
                "label": "Chief Hostel Warden",
                "password": "Warden@123",
            },
            {
                "username": "teacher1",
                "role": "teacher",
                "full_name": "Dr. Sunita Rao",
                "label": "Faculty / Maintenance Committee",
                "password": "Teacher@123",
            },
        ]
    }


# ── AI Auto-Classification & Recommendation ────────────────────────────────

@app.post("/api/complaints/recommend")
async def recommend_complaint(data: RecommendRequest):
    """
    Intelligent pre-submission recommendation:
    1. Validates input text (flags nonsense / casual greetings / ambiguity).
    2. Predicts automatic category across 10 standard categories.
    3. Predicts P1–P4 priority with context explanation.
    4. Recommends target maintenance department and suggested safety action.
    5. Flags low confidence / manual review requirement if needed.
    """
    val = validate_complaint_content(data.title, data.description)
    if not val["is_valid"]:
        return {
            "is_valid": False,
            "status": val["status"],
            "validation_message": val["message"],
            "suggestion": val.get("suggestion"),
            "is_ambiguous": val.get("is_ambiguous", False),
            "clarification_prompt": val.get("clarification_prompt"),
            "category": None,
            "priority": None,
        }

    rule_res = rule_analyze(data.title, data.description, data.category or "Other Maintenance")
    det_cat = rule_res.get("category", "Other Maintenance")

    ai_res = None
    try:
        ai_res = await analyze_with_ai(data.title, data.description, det_cat)
    except Exception:
        pass

    if ai_res:
        merged = override_priority(
            ai_priority=ai_res["suggested_priority"],
            rule_priority=rule_res["priority"],
            rule_reason=rule_res["reason"],
        )
        final_priority = merged["final_priority"]
        priority_reason = merged["explanation"]
        final_category = ai_res.get("category") or det_cat
        suggested_action = ai_res.get("suggested_action") or rule_res.get("suggested_action")
        confidence = ai_res.get("confidence", 0.92)
        requires_manual_review = ai_res.get("requires_manual_review", False)
    else:
        final_priority = rule_res["priority"]
        priority_reason = rule_res["reason"]
        final_category = det_cat
        suggested_action = rule_res.get("suggested_action", "Inspect and dispatch maintenance personnel.")
        confidence = 0.88 if "Critical" in rule_res.get("priority", "") or "P1" in rule_res.get("priority", "") else 0.80
        requires_manual_review = False

    dept = CATEGORY_DEPARTMENTS.get(final_category, rule_res.get("department", "General Maintenance Services"))

    return {
        "is_valid": True,
        "is_ambiguous": val.get("is_ambiguous", False),
        "clarification_prompt": val.get("clarification_prompt"),
        "validation_message": val["message"],
        "category": final_category,
        "priority": final_priority,
        "priority_reason": priority_reason,
        "department": dept,
        "suggested_action": suggested_action,
        "confidence": confidence,
        "requires_manual_review": requires_manual_review,
        "safety_warning": rule_res.get("safety_warning"),
        "is_critical": "Critical" in final_priority or "P1" in final_priority,
    }


# ── Dashboard Stats ───────────────────────────────────────────────────────

@app.get("/api/stats")
async def get_stats(current_user: Optional[dict[str, Any]] = Depends(get_current_user_optional)):
    """Return aggregate counts for the dashboard cards, with role-aware metrics."""
    conn = get_db()
    try:
        total     = conn.execute("SELECT COUNT(*) AS c FROM complaints").fetchone()["c"]
        critical  = conn.execute("SELECT COUNT(*) AS c FROM complaints WHERE priority LIKE '%Critical%' OR priority LIKE '%P1%'").fetchone()["c"]
        high      = conn.execute("SELECT COUNT(*) AS c FROM complaints WHERE priority LIKE '%High%' OR priority LIKE '%P2%'").fetchone()["c"]
        pending   = conn.execute("SELECT COUNT(*) AS c FROM complaints WHERE status = ?", ("Pending",)).fetchone()["c"]
        resolved  = conn.execute("SELECT COUNT(*) AS c FROM complaints WHERE status = ?", ("Resolved",)).fetchone()["c"]

        p1 = critical
        p2 = high
        p3 = conn.execute("SELECT COUNT(*) AS c FROM complaints WHERE priority LIKE '%Medium%' OR priority LIKE '%P3%'").fetchone()["c"]
        p4 = conn.execute("SELECT COUNT(*) AS c FROM complaints WHERE priority LIKE '%Low%' OR priority LIKE '%P4%'").fetchone()["c"]

        result = {
            "total": total,
            "critical": critical,
            "high": high,
            "pending": pending,
            "resolved": resolved,
            "priority_distribution": {
                "P1": p1,
                "P2": p2,
                "P3": p3,
                "P4": p4,
            },
        }

        if current_user and current_user.get("role") == "student":
            uid = current_user.get("sub")
            uname = current_user.get("full_name") or current_user.get("username")
            my_tot = conn.execute(
                "SELECT COUNT(*) AS c FROM complaints WHERE student_id = ? OR student_name = ?",
                (uid, uname),
            ).fetchone()["c"]
            my_pend = conn.execute(
                "SELECT COUNT(*) AS c FROM complaints WHERE (student_id = ? OR student_name = ?) AND status != 'Resolved'",
                (uid, uname),
            ).fetchone()["c"]
            my_res = conn.execute(
                "SELECT COUNT(*) AS c FROM complaints WHERE (student_id = ? OR student_name = ?) AND status = 'Resolved'",
                (uid, uname),
            ).fetchone()["c"]
            result["student_stats"] = {
                "my_total": my_tot,
                "my_pending": my_pend,
                "my_resolved": my_res,
            }

        return result
    finally:
        conn.close()


# ── Categories ─────────────────────────────────────────────────────────────

@app.get("/api/categories")
async def list_categories():
    """Return the list of allowed complaint categories."""
    return {"categories": CATEGORIES}


# ── Urgency Ranked Queue (Teachers / Wardens) ──────────────────────────────

@app.get("/api/complaints/ranked")
async def list_ranked_complaints(
    current_user: Optional[dict[str, Any]] = Depends(get_current_user_optional),
):
    """
    Returns all active complaints dynamically ranked from most urgent to least urgent
    using the multi-factor ranking algorithm.
    """
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM complaints WHERE status != 'Resolved'").fetchall()
        complaints_list = [_row_to_dict(r) for r in rows]
        ranked = rank_all_complaints(complaints_list)
        return {
            "total_ranked": len(ranked),
            "ranked_complaints": ranked,
        }
    finally:
        conn.close()


# ── Category-wise Complaint Arranger ───────────────────────────────────────

@app.get("/api/complaints/by-category")
async def list_complaints_by_category():
    """
    Groups complaints across the 10 standard categories,
    each containing summary statistics and sorted priority queue.
    """
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM complaints").fetchall()
        all_complaints = [_row_to_dict(r) for r in rows]

        categories_data = []
        for cat in CATEGORIES:
            matching = [c for c in all_complaints if c.get("category") == cat]
            crit_count = sum(1 for c in matching if "Critical" in str(c.get("priority")) or "P1" in str(c.get("priority")))
            pend_count = sum(1 for c in matching if c.get("status") == "Pending")
            matching.sort(key=lambda x: x.get("ranking_score") or 0.0, reverse=True)

            categories_data.append({
                "category": cat,
                "department": CATEGORY_DEPARTMENTS.get(cat, "General Maintenance Services"),
                "total_complaints": len(matching),
                "critical_complaints": crit_count,
                "pending_complaints": pend_count,
                "complaints": matching,
            })

        return {"categories": categories_data}
    finally:
        conn.close()


# ── Complaints CRUD ───────────────────────────────────────────────────────

@app.get("/api/complaints")
async def list_complaints(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    student_id: Optional[str] = Query(None),
    mine_only: Optional[bool] = Query(False),
    sort_by: Optional[str] = Query("date"),      # "date" | "priority" | "urgency"
    order: Optional[str] = Query("desc"),          # "asc" | "desc"
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: Optional[dict[str, Any]] = Depends(get_current_user_optional),
):
    """List complaints with optional filtering, sorting, pagination, and role-based scoping."""
    conn = get_db()
    try:
        clauses: list[str] = []
        params: list[Any] = []

        # Role enforcement: if logged in as student, restrict to their own complaints
        if current_user and current_user.get("role") == "student":
            clauses.append("(student_id = ? OR student_name = ?)")
            params.extend([current_user.get("sub"), current_user.get("full_name") or current_user.get("username")])
        elif mine_only and current_user:
            clauses.append("(student_id = ? OR student_name = ?)")
            params.extend([current_user.get("sub"), current_user.get("full_name") or current_user.get("username")])
        elif student_id:
            clauses.append("student_id = ?")
            params.append(student_id)

        if status:
            clauses.append("status = ?")
            params.append(status)
        if priority:
            clauses.append("priority LIKE ?")
            params.append(f"%{priority}%")
        if category:
            clauses.append("category = ?")
            params.append(category)
        if search:
            clauses.append("(title LIKE ? OR description LIKE ? OR location LIKE ?)")
            like = f"%{search}%"
            params.extend([like, like, like])

        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""

        if sort_by == "urgency":
            order_clause = f"COALESCE(ranking_score, 0) {'DESC' if order == 'desc' else 'ASC'}"
        elif sort_by == "priority":
            priority_order = (
                "CASE "
                "WHEN priority LIKE '%Critical%' OR priority LIKE '%P1%' THEN 0 "
                "WHEN priority LIKE '%High%' OR priority LIKE '%P2%' THEN 1 "
                "WHEN priority LIKE '%Medium%' OR priority LIKE '%P3%' THEN 2 "
                "WHEN priority LIKE '%Low%' OR priority LIKE '%P4%' THEN 3 "
                "ELSE 4 END"
            )
            order_clause = f"{priority_order} {'DESC' if order == 'desc' else 'ASC'}"
        else:
            order_clause = f"created_at {'DESC' if order == 'desc' else 'ASC'}"

        count_row = conn.execute(
            f"SELECT COUNT(*) AS c FROM complaints{where}", params
        ).fetchone()
        total = count_row["c"]

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
            "total_pages": max(1, -(-total // per_page)),
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
async def create_complaint(
    data: ComplaintCreate,
    current_user: Optional[dict[str, Any]] = Depends(get_current_user_optional),
):
    """
    Submit a new complaint.
    1. Pre-validate complaint content (reject chit-chat, nonsense, casual greetings).
    2. Run the rule-based safety engine (deterministic 0ms safety override).
    3. Run AI analysis (Gemini / Ollama / Fallback).
    4. Merge priorities (rule engine enforces Critical override).
    5. Compute multi-factor urgency ranking score.
    6. Persist to database with student role mapping and ranking metadata.
    7. Recalculate dynamic urgency rank across all active complaints.
    """
    # Step 0: Input Pre-validation
    val = validate_complaint_content(data.title, data.description)
    if not val["is_valid"]:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "INVALID_COMPLAINT",
                "message": val["message"],
                "suggestion": val.get("suggestion", "Please submit a specific campus facility or maintenance issue."),
                "is_ambiguous": val.get("is_ambiguous", False),
            },
        )

    conn = get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        complaint_id = _next_complaint_id(conn)

        # Resolve student info
        student_id = None
        student_name = (data.student_name or "").strip()
        if current_user:
            student_id = current_user.get("sub")
            if not student_name or student_name.lower() in ("student", "user", "anonymous"):
                student_name = current_user.get("full_name") or current_user.get("username")
        if not student_name:
            student_name = "Campus Student"

        input_category = data.category or "Other Maintenance"

        # Step 1: Rule-based analysis
        rule_result = rule_analyze(data.title, data.description, input_category)
        detected_category = rule_result.get("category", input_category)

        # Step 2: AI analysis
        ai_result = None
        try:
            ai_result = await analyze_with_ai(data.title, data.description, detected_category)
        except Exception:
            pass

        # Step 3: Merge priorities
        if ai_result:
            merged = override_priority(
                ai_priority=ai_result["suggested_priority"],
                rule_priority=rule_result["priority"],
                rule_reason=rule_result["reason"],
            )
            final_priority = merged["final_priority"]
            priority_reason = merged["explanation"]
            final_category = ai_result.get("category") or detected_category
            analysis_blob = {
                **ai_result,
                "rule_engine": rule_result,
                "priority_override": merged,
                "validation": val,
            }
        else:
            final_priority = rule_result["priority"]
            priority_reason = rule_result["reason"]
            final_category = detected_category
            fallback = get_fallback_analysis(
                data.title, data.description, final_category, rule_result
            )
            analysis_blob = {
                **fallback,
                "rule_engine": rule_result,
                "validation": val,
            }

        # Step 4: Urgency Ranking
        rank_data = calculate_complaint_ranking({
            "priority": final_priority,
            "title": data.title,
            "description": data.description,
            "location": data.location,
            "created_at": now,
        })
        ranking_score = rank_data.get("ranking_score", 0.0)
        ranking_reason = rank_data.get("ranking_reason", "")
        affected_scope = rank_data.get("affected_scope", "Single Room / Localized")
        damage_risk = rank_data.get("damage_risk", "Contained")

        dept = CATEGORY_DEPARTMENTS.get(final_category, rule_result.get("department", "General Maintenance Services"))

        # Step 5: Save
        conn.execute(
            """
            INSERT INTO complaints
                (id, student_id, student_name, location, room_number, title, description,
                 category, image_path, status, priority, priority_reason,
                 ai_analysis, assigned_department, created_at, updated_at,
                 is_demo, ranking_score, urgency_rank, ranking_reason, affected_scope, damage_risk)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                complaint_id,
                student_id,
                student_name,
                data.location,
                data.room_number or "",
                data.title,
                data.description,
                final_category,
                data.image_path,
                "Pending",
                final_priority,
                priority_reason,
                json.dumps(analysis_blob),
                dept,
                now,
                now,
                0,
                ranking_score,
                None,
                ranking_reason,
                affected_scope,
                damage_risk,
            ),
        )
        conn.commit()

        # Update ranks for all active complaints
        active_rows = conn.execute(
            "SELECT * FROM complaints WHERE status != 'Resolved' ORDER BY ranking_score DESC"
        ).fetchall()
        for idx, row in enumerate(active_rows, start=1):
            conn.execute("UPDATE complaints SET urgency_rank = ? WHERE id = ?", (idx, row["id"]))
        conn.commit()

        row = conn.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
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
            "is_valid": True,
        }

    val = validate_complaint_content(data.title, data.description)
    if not val["is_valid"]:
        return {
            "predicted_priority": "Invalid",
            "safety_warning": None,
            "immediate_advice": val["message"],
            "is_critical": False,
            "is_valid": False,
            "validation_message": val["message"],
            "suggestion": val.get("suggestion"),
        }

    rule_result = rule_analyze(data.title, data.description, data.category or "Other Maintenance")
    is_critical = "Critical" in rule_result.get("priority", "") or "P1" in rule_result.get("priority", "")

    if is_critical:
        immediate_advice = "[SAFETY ALERT] Potential emergency hazard. Stay at least 5 meters away and do NOT touch anything."
    elif "High" in rule_result.get("priority", "") or "P2" in rule_result.get("priority", ""):
        immediate_advice = "[Caution] Please warn others nearby and avoid the immediate area."
    else:
        immediate_advice = "Standard maintenance review will be scheduled."

    return {
        "predicted_priority": rule_result.get("priority"),
        "predicted_category": rule_result.get("category"),
        "predicted_department": rule_result.get("department"),
        "safety_warning": rule_result.get("safety_warning"),
        "immediate_advice": immediate_advice,
        "is_critical": is_critical,
        "is_valid": True,
        "is_ambiguous": val.get("is_ambiguous", False),
        "clarification_prompt": val.get("clarification_prompt"),
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



