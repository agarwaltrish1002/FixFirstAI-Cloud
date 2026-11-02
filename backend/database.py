"""
FixFirstAI - Database Layer & Schema Migrations
=================================================
Manages SQLite storage for Complaints, Tickets, Multi-Role Users,
Workers, Maintenance Assignments, Audit Logs, and Real-Time Notifications.

Guarantees:
- Zero data loss: All migrations use non-destructive ALTER TABLE commands.
- Secure credential storage using Argon2id.
- Parameterized SQL queries preventing injection attacks.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from backend.config import DATABASE_PATH, CATEGORY_DEPARTMENTS


# ---------------------------------------------------------------------------
# Connection helper
# ---------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    """
    Return a new SQLite connection with row_factory set so rows behave like
    dicts (accessible by column name).
    """
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")  # better concurrency
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ---------------------------------------------------------------------------
# Schema creation & Auto-Migrations
# ---------------------------------------------------------------------------

def init_db() -> None:
    """Create all core and multi-role tables if they don't exist and run non-destructive migrations."""
    conn = get_db()
    try:
        conn.executescript(
            """
            -- Users Table (RBAC: student, warden, worker, admin)
            CREATE TABLE IF NOT EXISTS users (
                id                      TEXT PRIMARY KEY,
                username                TEXT UNIQUE NOT NULL,
                email                   TEXT UNIQUE,
                phone                   TEXT,
                full_name               TEXT NOT NULL,
                role                    TEXT NOT NULL,
                password_hash           TEXT NOT NULL,
                salt                    TEXT NOT NULL,
                department_or_hostel    TEXT,
                assigned_area           TEXT,
                account_status          TEXT NOT NULL DEFAULT 'Active',
                is_temporary_password   INTEGER NOT NULL DEFAULT 0,
                created_at              TEXT NOT NULL,
                updated_at              TEXT NOT NULL
            );

            -- Complaints Table
            CREATE TABLE IF NOT EXISTS complaints (
                id                  TEXT PRIMARY KEY,
                student_name        TEXT NOT NULL,
                location            TEXT NOT NULL,
                room_number         TEXT,
                title               TEXT NOT NULL,
                description         TEXT NOT NULL,
                category            TEXT NOT NULL,
                image_path          TEXT,
                status              TEXT NOT NULL DEFAULT 'Pending',
                priority            TEXT NOT NULL DEFAULT 'Medium',
                priority_reason     TEXT,
                ai_analysis         TEXT,
                assigned_department TEXT,
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL,
                is_demo             INTEGER NOT NULL DEFAULT 0,
                student_id          TEXT,
                urgency_rank        INTEGER,
                ranking_score       REAL,
                ranking_reason      TEXT,
                affected_scope      TEXT,
                damage_risk         TEXT,
                assigned_worker_id  TEXT,
                assigned_worker_name TEXT,
                is_sensitive_hygiene INTEGER NOT NULL DEFAULT 0,
                reopened_count      INTEGER NOT NULL DEFAULT 0,
                feedback_rating     INTEGER,
                feedback_comment    TEXT,
                completed_at        TEXT,
                verified_at         TEXT
            );

            -- Maintenance Tickets Table
            CREATE TABLE IF NOT EXISTS tickets (
                id                  TEXT PRIMARY KEY,
                complaint_id        TEXT NOT NULL,
                location            TEXT NOT NULL,
                issue_summary       TEXT NOT NULL,
                priority            TEXT NOT NULL,
                priority_reason     TEXT,
                recommended_action  TEXT,
                department          TEXT NOT NULL,
                status              TEXT NOT NULL DEFAULT 'Open',
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL,
                technician_name     TEXT,
                root_cause          TEXT,
                preventive_action   TEXT,
                safety_signoff      INTEGER NOT NULL DEFAULT 0,
                sla_target_at       TEXT,
                resolved_at         TEXT,
                FOREIGN KEY (complaint_id) REFERENCES complaints(id)
            );

            -- Worker Profiles Table
            CREATE TABLE IF NOT EXISTS workers (
                id                  TEXT PRIMARY KEY,
                user_id             TEXT UNIQUE NOT NULL,
                name                TEXT NOT NULL,
                phone               TEXT,
                department          TEXT NOT NULL,
                assigned_area       TEXT,
                specialization      TEXT,
                is_available        INTEGER NOT NULL DEFAULT 1,
                active_jobs_count   INTEGER NOT NULL DEFAULT 0,
                rating              REAL DEFAULT 5.0,
                created_at          TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            -- Worker Task Assignments Table
            CREATE TABLE IF NOT EXISTS assignments (
                id                  TEXT PRIMARY KEY,
                complaint_id        TEXT NOT NULL,
                worker_id           TEXT NOT NULL,
                warden_id           TEXT NOT NULL,
                assigned_at         TEXT NOT NULL,
                status              TEXT NOT NULL DEFAULT 'Pending',
                rejection_reason    TEXT,
                worker_notes        TEXT,
                before_photo        TEXT,
                after_photo         TEXT,
                started_at          TEXT,
                completed_at        TEXT,
                verified_at         TEXT,
                warden_feedback     TEXT,
                FOREIGN KEY (complaint_id) REFERENCES complaints(id),
                FOREIGN KEY (worker_id) REFERENCES workers(id)
            );

            -- Real-Time Role Notifications Table
            CREATE TABLE IF NOT EXISTS notifications (
                id                  TEXT PRIMARY KEY,
                user_id             TEXT,
                role_target         TEXT,
                type                TEXT NOT NULL,
                title               TEXT NOT NULL,
                message             TEXT NOT NULL,
                complaint_id        TEXT,
                is_read             INTEGER NOT NULL DEFAULT 0,
                created_at          TEXT NOT NULL
            );

            -- Admin Audit Logs Table
            CREATE TABLE IF NOT EXISTS audit_logs (
                id                  TEXT PRIMARY KEY,
                admin_id            TEXT NOT NULL,
                admin_name          TEXT NOT NULL,
                action              TEXT NOT NULL,
                target_user_id      TEXT,
                target_username     TEXT,
                details             TEXT NOT NULL,
                created_at          TEXT NOT NULL
            );
            """
        )

        # Non-destructive migrations for users table
        existing_user_cols = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        user_migrations = [
            ("email", "TEXT"),
            ("phone", "TEXT"),
            ("assigned_area", "TEXT"),
            ("account_status", "TEXT DEFAULT 'Active'"),
            ("is_temporary_password", "INTEGER DEFAULT 0"),
            ("updated_at", "TEXT"),
        ]
        for col_name, col_def in user_migrations:
            if col_name not in existing_user_cols:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}")

        # Non-destructive migrations for complaints table
        existing_complaint_cols = {row["name"] for row in conn.execute("PRAGMA table_info(complaints)").fetchall()}
        complaint_migrations = [
            ("student_id", "TEXT"),
            ("urgency_rank", "INTEGER"),
            ("ranking_score", "REAL"),
            ("ranking_reason", "TEXT"),
            ("affected_scope", "TEXT"),
            ("damage_risk", "TEXT"),
            ("assigned_worker_id", "TEXT"),
            ("assigned_worker_name", "TEXT"),
            ("is_sensitive_hygiene", "INTEGER DEFAULT 0"),
            ("reopened_count", "INTEGER DEFAULT 0"),
            ("feedback_rating", "INTEGER"),
            ("feedback_comment", "TEXT"),
            ("completed_at", "TEXT"),
            ("verified_at", "TEXT"),
        ]
        for col_name, col_def in complaint_migrations:
            if col_name not in existing_complaint_cols:
                conn.execute(f"ALTER TABLE complaints ADD COLUMN {col_name} {col_def}")

        conn.commit()
    finally:
        conn.close()

    seed_demo_users()


# ---------------------------------------------------------------------------
# Demo Accounts & Worker Seeding
# ---------------------------------------------------------------------------

def seed_demo_users() -> None:
    """Seed demo accounts across all 4 roles (Student, Warden, Worker, Admin) using Argon2id."""
    from backend.auth import hash_password

    conn = get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        demo_users = [
            {
                "id": "USR-STU-001",
                "username": "student1",
                "email": "aarav.sharma@campus.edu",
                "phone": "+91 98765 43210",
                "full_name": "Aarav Sharma",
                "role": "student",
                "password": "Student@123",
                "department_or_hostel": "Hostel Block B (Room 204)",
                "assigned_area": "Hostel Block B",
            },
            {
                "id": "USR-STU-002",
                "username": "student2",
                "email": "diya.patel@campus.edu",
                "phone": "+91 98765 43211",
                "full_name": "Diya Patel",
                "role": "student",
                "password": "Student@123",
                "department_or_hostel": "Hostel Block A (Room 112)",
                "assigned_area": "Hostel Block A",
            },
            {
                "id": "USR-WRD-001",
                "username": "warden1",
                "email": "rajesh.verma@campus.edu",
                "phone": "+91 98765 43220",
                "full_name": "Prof. Rajesh Verma",
                "role": "warden",
                "password": "Warden@123",
                "department_or_hostel": "Chief Warden Office & Estate Admin",
                "assigned_area": "All Hostels & Residential",
            },
            {
                "id": "USR-TCH-001",
                "username": "teacher1",
                "email": "sunita.rao@campus.edu",
                "phone": "+91 98765 43221",
                "full_name": "Dr. Sunita Rao",
                "role": "teacher",
                "password": "Teacher@123",
                "department_or_hostel": "Academic Affairs & Maintenance Committee",
                "assigned_area": "Academic Blocks & Library",
            },
            {
                "id": "USR-WRK-001",
                "username": "worker1",
                "email": "ramesh.kumar@service.campus.edu",
                "phone": "+91 98765 43230",
                "full_name": "Ramesh Kumar",
                "role": "worker",
                "password": "Worker@123",
                "department_or_hostel": "Housekeeping & Hygiene Operations",
                "assigned_area": "Hostel Block A & B",
                "specialization": "Sanitation & Bio-Hazard Disinfection Specialist",
            },
            {
                "id": "USR-WRK-002",
                "username": "worker2",
                "email": "suresh.sharma@service.campus.edu",
                "phone": "+91 98765 43231",
                "full_name": "Suresh Sharma",
                "role": "worker",
                "password": "Worker@123",
                "department_or_hostel": "Electrical Maintenance",
                "assigned_area": "Academic Blocks 1 & 2",
                "specialization": "High-Voltage & Power Systems Electrician",
            },
            {
                "id": "USR-ADM-001",
                "username": "admin1",
                "email": "estate.admin@campus.edu",
                "phone": "+91 98765 43200",
                "full_name": "Dr. Ananya Sen (Chief Estate Officer)",
                "role": "admin",
                "password": "Admin@123",
                "department_or_hostel": "Campus Estate & Facility Administration",
                "assigned_area": "Full Campus",
            },
        ]

        for u in demo_users:
            existing = conn.execute("SELECT id FROM users WHERE username = ?", (u["username"],)).fetchone()
            if not existing:
                pwd_hash, salt = hash_password(u["password"])
                conn.execute(
                    """
                    INSERT INTO users (
                        id, username, email, phone, full_name, role, password_hash, salt,
                        department_or_hostel, assigned_area, account_status, is_temporary_password,
                        created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 0, ?, ?)
                    """,
                    (
                        u["id"], u["username"], u["email"], u["phone"], u["full_name"],
                        u["role"], pwd_hash, salt, u["department_or_hostel"],
                        u["assigned_area"], now, now
                    ),
                )

        # Seed workers table
        worker_records = [
            {
                "id": "WRK-001",
                "user_id": "USR-WRK-001",
                "name": "Ramesh Kumar",
                "phone": "+91 98765 43230",
                "department": "Housekeeping & Hygiene Operations",
                "assigned_area": "Hostel Block A & B",
                "specialization": "Sanitation & Bio-Hazard Disinfection Specialist",
            },
            {
                "id": "WRK-002",
                "user_id": "USR-WRK-002",
                "name": "Suresh Sharma",
                "phone": "+91 98765 43231",
                "department": "Electrical Maintenance",
                "assigned_area": "Academic Blocks 1 & 2",
                "specialization": "High-Voltage & Power Systems Electrician",
            },
        ]
        for w in worker_records:
            existing_w = conn.execute("SELECT id FROM workers WHERE id = ?", (w["id"],)).fetchone()
            if not existing_w:
                conn.execute(
                    """
                    INSERT INTO workers (id, user_id, name, phone, department, assigned_area, specialization, is_available, active_jobs_count, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
                    """,
                    (w["id"], w["user_id"], w["name"], w["phone"], w["department"], w["assigned_area"], w["specialization"], now)
                )

        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# User & Candidate Management Queries (Admin)
# ---------------------------------------------------------------------------

def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    """Fetch user record by username."""
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch user record by ID."""
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_all_candidates(
    role: Optional[str] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List candidates/users for Admin dashboard with filtering and search."""
    conn = get_db()
    try:
        query = """
            SELECT id, username, email, phone, full_name, role, department_or_hostel,
                   assigned_area, account_status, is_temporary_password, created_at, updated_at
            FROM users
            WHERE 1=1
        """
        params: List[Any] = []

        if role:
            query += " AND role = ?"
            params.append(role.lower())
        if status:
            query += " AND account_status = ?"
            params.append(status)
        if department:
            query += " AND department_or_hostel LIKE ?"
            params.append(f"%{department}%")
        if search:
            query += " AND (full_name LIKE ? OR username LIKE ? OR email LIKE ? OR phone LIKE ?)"
            s = f"%{search}%"
            params.extend([s, s, s, s])

        query += " ORDER BY created_at DESC"
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def create_candidate(
    full_name: str,
    email: str,
    phone: str,
    username: str,
    role: str,
    department: str,
    assigned_area: str,
    password: str,
    is_temporary_password: bool = True,
) -> Dict[str, Any]:
    """Create a new candidate account with Argon2id password hashing."""
    from backend.auth import hash_password

    conn = get_db()
    try:
        # Check uniqueness
        existing = conn.execute(
            "SELECT id FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?)",
            (username, email),
        ).fetchone()
        if existing:
            raise ValueError(f"Username '{username}' or Email '{email}' is already registered.")

        # Generate candidate ID
        prefix = "USR-WRK" if role == "worker" else ("USR-WRD" if role == "warden" else ("USR-STU" if role == "student" else "USR-ADM"))
        count_row = conn.execute("SELECT COUNT(*) AS cnt FROM users").fetchone()
        user_id = f"{prefix}-{count_row['cnt'] + 101:03d}"

        now = datetime.now(timezone.utc).isoformat()
        pwd_hash, salt = hash_password(password)

        conn.execute(
            """
            INSERT INTO users (
                id, username, email, phone, full_name, role, password_hash, salt,
                department_or_hostel, assigned_area, account_status, is_temporary_password,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?)
            """,
            (
                user_id, username, email, phone, full_name, role.lower(),
                pwd_hash, salt, department, assigned_area,
                1 if is_temporary_password else 0, now, now
            ),
        )

        # If role is worker, also register in workers table
        if role.lower() == "worker":
            w_cnt = conn.execute("SELECT COUNT(*) AS cnt FROM workers").fetchone()["cnt"]
            worker_id = f"WRK-{w_cnt + 1:03d}"
            conn.execute(
                """
                INSERT INTO workers (id, user_id, name, phone, department, assigned_area, specialization, is_available, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (worker_id, user_id, full_name, phone, department, assigned_area, department, now)
            )

        conn.commit()
        return get_user_by_id(user_id)  # type: ignore
    finally:
        conn.close()


def update_candidate(
    user_id: str,
    full_name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    role: Optional[str] = None,
    department: Optional[str] = None,
    assigned_area: Optional[str] = None,
    account_status: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Update candidate profile details."""
    conn = get_db()
    try:
        fields = []
        params = []
        now = datetime.now(timezone.utc).isoformat()

        if full_name is not None:
            fields.append("full_name = ?")
            params.append(full_name)
        if email is not None:
            fields.append("email = ?")
            params.append(email)
        if phone is not None:
            fields.append("phone = ?")
            params.append(phone)
        if role is not None:
            fields.append("role = ?")
            params.append(role.lower())
        if department is not None:
            fields.append("department_or_hostel = ?")
            params.append(department)
        if assigned_area is not None:
            fields.append("assigned_area = ?")
            params.append(assigned_area)
        if account_status is not None:
            fields.append("account_status = ?")
            params.append(account_status)

        if not fields:
            return get_user_by_id(user_id)

        fields.append("updated_at = ?")
        params.append(now)
        params.append(user_id)

        conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
        return get_user_by_id(user_id)
    finally:
        conn.close()


def reset_candidate_password(user_id: str, new_password: str, is_temporary: bool = True) -> bool:
    """Secure password reset by Admin or User."""
    from backend.auth import hash_password

    conn = get_db()
    try:
        pwd_hash, salt = hash_password(new_password)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            UPDATE users
            SET password_hash = ?, salt = ?, is_temporary_password = ?, updated_at = ?
            WHERE id = ?
            """,
            (pwd_hash, salt, 1 if is_temporary else 0, now, user_id),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def set_candidate_status(user_id: str, status_value: str) -> bool:
    """Activate or Deactivate candidate account."""
    conn = get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?",
            (status_value, now, user_id),
        )
        conn.commit()
        return True
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Audit Logging Helpers (Admin Compliance)
# ---------------------------------------------------------------------------

def log_audit_event(
    admin_id: str,
    admin_name: str,
    action: str,
    target_user_id: Optional[str],
    target_username: Optional[str],
    details: str,
) -> None:
    """Record an administrative audit log entry."""
    conn = get_db()
    try:
        count_row = conn.execute("SELECT COUNT(*) AS cnt FROM audit_logs").fetchone()
        log_id = f"AUD-{count_row['cnt'] + 1:04d}"
        now = datetime.now(timezone.utc).isoformat()

        conn.execute(
            """
            INSERT INTO audit_logs (id, admin_id, admin_name, action, target_user_id, target_username, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (log_id, admin_id, admin_name, action, target_user_id, target_username, details, now),
        )
        conn.commit()
    finally:
        conn.close()


def get_audit_logs(limit: int = 100) -> List[Dict[str, Any]]:
    """Retrieve recent audit logs for the Admin dashboard."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Worker Task & Assignment Queries
# ---------------------------------------------------------------------------

def get_all_workers(department: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get active maintenance workers for Warden task delegation."""
    conn = get_db()
    try:
        if department:
            rows = conn.execute(
                """
                SELECT w.*, u.email, u.account_status
                FROM workers w
                JOIN users u ON w.user_id = u.id
                WHERE u.account_status = 'Active' AND w.department LIKE ?
                ORDER BY w.active_jobs_count ASC
                """,
                (f"%{department}%",),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT w.*, u.email, u.account_status
                FROM workers w
                JOIN users u ON w.user_id = u.id
                WHERE u.account_status = 'Active'
                ORDER BY w.active_jobs_count ASC
                """
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def assign_complaint_to_worker(
    complaint_id: str,
    worker_id: str,
    warden_id: str,
    instructions: Optional[str] = None,
) -> Dict[str, Any]:
    """Warden assigns a complaint to a specific maintenance worker."""
    conn = get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        asn_cnt = conn.execute("SELECT COUNT(*) AS cnt FROM assignments").fetchone()["cnt"]
        assignment_id = f"ASN-{asn_cnt + 1:03d}"

        # Get worker details
        worker = conn.execute("SELECT * FROM workers WHERE id = ?", (worker_id,)).fetchone()
        if not worker:
            raise ValueError(f"Worker with ID '{worker_id}' not found.")

        # Create Assignment record
        conn.execute(
            """
            INSERT INTO assignments (
                id, complaint_id, worker_id, warden_id, assigned_at, status, worker_notes
            )
            VALUES (?, ?, ?, ?, ?, 'Pending', ?)
            """,
            (assignment_id, complaint_id, worker_id, warden_id, now, instructions or ""),
        )

        # Update Complaint record
        conn.execute(
            """
            UPDATE complaints
            SET status = 'Assigned', assigned_worker_id = ?, assigned_worker_name = ?, updated_at = ?
            WHERE id = ?
            """,
            (worker_id, worker["name"], now, complaint_id),
        )

        # Increment worker's active job count
        conn.execute(
            "UPDATE workers SET active_jobs_count = active_jobs_count + 1 WHERE id = ?",
            (worker_id,),
        )

        # Create Worker notification
        create_notification(
            user_id=worker["user_id"],
            role_target="worker",
            notif_type="task_assigned",
            title="New Maintenance Job Assigned",
            message=f"You have been assigned complaint {complaint_id} by the Warden.",
            complaint_id=complaint_id,
            conn=conn,
        )

        conn.commit()
        return {
            "assignment_id": assignment_id,
            "complaint_id": complaint_id,
            "worker_id": worker_id,
            "worker_name": worker["name"],
            "status": "Assigned",
            "assigned_at": now,
        }
    finally:
        conn.close()


def get_worker_tasks(worker_user_id: str, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Retrieve tasks assigned to a worker.
    PRIVACY ENFORCEMENT: Masks student name and contact details if the complaint is flagged
    as sensitive menstrual hygiene or bodily sanitation.
    """
    conn = get_db()
    try:
        worker = conn.execute("SELECT id FROM workers WHERE user_id = ?", (worker_user_id,)).fetchone()
        if not worker:
            return []

        worker_id = worker["id"]
        query = """
            SELECT a.id AS assignment_id, a.status AS assignment_status, a.assigned_at,
                   a.started_at, a.completed_at, a.verified_at, a.rejection_reason,
                   a.worker_notes, a.before_photo, a.after_photo, a.warden_feedback,
                   c.id AS complaint_id, c.title, c.description, c.location, c.room_number,
                   c.category, c.priority, c.urgency_rank, c.ranking_score, c.student_name,
                   c.is_sensitive_hygiene, c.created_at AS complaint_date
            FROM assignments a
            JOIN complaints c ON a.complaint_id = c.id
            WHERE a.worker_id = ?
        """
        params = [worker_id]
        if status_filter:
            query += " AND a.status = ?"
            params.append(status_filter)

        query += " ORDER BY a.assigned_at DESC"
        rows = conn.execute(query, params).fetchall()

        tasks = []
        for r in rows:
            t = dict(r)
            # Student Privacy Masking for Sensitive Hygiene Complaints
            if t.get("is_sensitive_hygiene"):
                t["student_name"] = "[Identity Protected — Resident]"
                t["student_contact"] = "Authorized Facility Personnel Only"
            tasks.append(t)

        return tasks
    finally:
        conn.close()


def update_worker_task_status(
    assignment_id: str,
    new_status: str,
    worker_notes: Optional[str] = None,
    rejection_reason: Optional[str] = None,
    before_photo: Optional[str] = None,
    after_photo: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Worker updates the assignment lifecycle:
    Pending -> Accepted -> In Progress -> Completed.
    (Or Pending -> Rejected).
    """
    conn = get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        asn = conn.execute("SELECT * FROM assignments WHERE id = ?", (assignment_id,)).fetchone()
        if not asn:
            raise ValueError(f"Assignment '{assignment_id}' does not exist.")

        fields = ["status = ?"]
        params: List[Any] = [new_status]

        if new_status == "Accepted":
            fields.append("started_at = ?")
            params.append(now)
            conn.execute(
                "UPDATE complaints SET status = 'In Progress', updated_at = ? WHERE id = ?",
                (now, asn["complaint_id"]),
            )
        elif new_status == "In Progress":
            conn.execute(
                "UPDATE complaints SET status = 'In Progress', updated_at = ? WHERE id = ?",
                (now, asn["complaint_id"]),
            )
        elif new_status == "Completed":
            fields.append("completed_at = ?")
            params.append(now)
            conn.execute(
                "UPDATE complaints SET status = 'Completed', completed_at = ?, updated_at = ? WHERE id = ?",
                (now, now, asn["complaint_id"]),
            )
            # Notify Warden of work completion
            create_notification(
                role_target="warden",
                notif_type="repair_completed",
                title="Repair Completed — Warden Verification Needed",
                message=f"Assignment {assignment_id} for complaint {asn['complaint_id']} marked completed.",
                complaint_id=asn["complaint_id"],
                conn=conn,
            )
        elif new_status == "Rejected":
            fields.append("rejection_reason = ?")
            params.append(rejection_reason or "Worker unable to accept task")
            conn.execute(
                "UPDATE complaints SET status = 'Pending', assigned_worker_id = NULL, assigned_worker_name = NULL, updated_at = ? WHERE id = ?",
                (now, asn["complaint_id"]),
            )
            conn.execute(
                "UPDATE workers SET active_jobs_count = MAX(0, active_jobs_count - 1) WHERE id = ?",
                (asn["worker_id"],),
            )

        if worker_notes is not None:
            fields.append("worker_notes = ?")
            params.append(worker_notes)
        if before_photo is not None:
            fields.append("before_photo = ?")
            params.append(before_photo)
        if after_photo is not None:
            fields.append("after_photo = ?")
            params.append(after_photo)

        params.append(assignment_id)
        conn.execute(f"UPDATE assignments SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()

        return {"assignment_id": assignment_id, "status": new_status, "updated_at": now}
    finally:
        conn.close()


def warden_verify_repair(
    assignment_id: str,
    action: str,  # 'verify' or 'reopen'
    feedback: Optional[str] = None,
) -> Dict[str, Any]:
    """Warden reviews completed work: marks Verified/Resolved or Reopens if incomplete."""
    conn = get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        asn = conn.execute("SELECT * FROM assignments WHERE id = ?", (assignment_id,)).fetchone()
        if not asn:
            raise ValueError(f"Assignment '{assignment_id}' not found.")

        if action == "verify":
            conn.execute(
                """
                UPDATE assignments
                SET status = 'Verified', verified_at = ?, warden_feedback = ?
                WHERE id = ?
                """,
                (now, feedback or "Verified by Hostel Warden", assignment_id),
            )
            conn.execute(
                """
                UPDATE complaints
                SET status = 'Resolved', verified_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, now, asn["complaint_id"]),
            )
            # Free up worker job slot
            conn.execute(
                "UPDATE workers SET active_jobs_count = MAX(0, active_jobs_count - 1) WHERE id = ?",
                (asn["worker_id"],),
            )
            # Notify Student
            cmp_row = conn.execute("SELECT student_id FROM complaints WHERE id = ?", (asn["complaint_id"],)).fetchone()
            if cmp_row and cmp_row["student_id"]:
                create_notification(
                    user_id=cmp_row["student_id"],
                    role_target="student",
                    notif_type="warden_verified",
                    title="Complaint Resolved & Verified",
                    message=f"Your complaint {asn['complaint_id']} has been inspected and verified as resolved.",
                    complaint_id=asn["complaint_id"],
                    conn=conn,
                )
            result_status = "Resolved & Verified"

        else:  # Reopen incomplete repair
            conn.execute(
                """
                UPDATE assignments
                SET status = 'Reopened', warden_feedback = ?
                WHERE id = ?
                """,
                (feedback or "Work incomplete. Reopened by Warden.", assignment_id),
            )
            conn.execute(
                """
                UPDATE complaints
                SET status = 'Assigned', reopened_count = reopened_count + 1, updated_at = ?
                WHERE id = ?
                """,
                (now, asn["complaint_id"]),
            )
            result_status = "Reopened"

        conn.commit()
        return {"assignment_id": assignment_id, "result": result_status, "verified_at": now}
    finally:
        conn.close()


def student_reopen_complaint(complaint_id: str, student_id: str, reason: str) -> Dict[str, Any]:
    """Student reopens an unresolved complaint."""
    conn = get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        cmp_row = conn.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
        if not cmp_row:
            raise ValueError(f"Complaint '{complaint_id}' not found.")
        if cmp_row["student_id"] and cmp_row["student_id"] != student_id:
            raise PermissionError("Students can only reopen their own complaints.")

        conn.execute(
            """
            UPDATE complaints
            SET status = 'Pending', reopened_count = reopened_count + 1, updated_at = ?
            WHERE id = ?
            """,
            (now, complaint_id),
        )

        create_notification(
            role_target="warden",
            notif_type="task_reopened",
            title="Complaint Reopened by Student",
            message=f"Student reopened complaint {complaint_id}: {reason}",
            complaint_id=complaint_id,
            conn=conn,
        )

        conn.commit()
        return {"complaint_id": complaint_id, "status": "Pending", "reopened_count": cmp_row["reopened_count"] + 1}
    finally:
        conn.close()


def submit_complaint_feedback(complaint_id: str, student_id: str, rating: int, comment: str) -> Dict[str, Any]:
    """Student provides resolution rating (1-5) and feedback."""
    conn = get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        cmp_row = conn.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
        if not cmp_row:
            raise ValueError(f"Complaint '{complaint_id}' not found.")
        if cmp_row["student_id"] and cmp_row["student_id"] != student_id:
            raise PermissionError("Students can only provide feedback on their own complaints.")

        conn.execute(
            """
            UPDATE complaints
            SET feedback_rating = ?, feedback_comment = ?, updated_at = ?
            WHERE id = ?
            """,
            (max(1, min(5, rating)), comment, now, complaint_id),
        )
        conn.commit()
        return {"complaint_id": complaint_id, "rating": rating, "comment": comment}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Notification Helpers
# ---------------------------------------------------------------------------

def create_notification(
    notif_type: str,
    title: str,
    message: str,
    user_id: Optional[str] = None,
    role_target: Optional[str] = None,
    complaint_id: Optional[str] = None,
    conn: Optional[sqlite3.Connection] = None,
) -> str:
    """Create a persistent user or role-based notification."""
    should_close = False
    if conn is None:
        conn = get_db()
        should_close = True
    try:
        now = datetime.now(timezone.utc).isoformat()
        cnt = conn.execute("SELECT COUNT(*) AS cnt FROM notifications").fetchone()["cnt"]
        notif_id = f"NTF-{cnt + 1:04d}"

        conn.execute(
            """
            INSERT INTO notifications (id, user_id, role_target, type, title, message, complaint_id, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (notif_id, user_id, role_target, notif_type, title, message, complaint_id, now),
        )
        if should_close:
            conn.commit()
        return notif_id
    finally:
        if should_close:
            conn.close()


def get_user_notifications(user_id: str, role: str) -> List[Dict[str, Any]]:
    """Retrieve notifications relevant to the authenticated user and their role."""
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT * FROM notifications
            WHERE user_id = ? OR role_target = ? OR role_target = 'all'
            ORDER BY created_at DESC LIMIT 50
            """,
            (user_id, role.lower()),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def mark_notification_read(notif_id: str) -> bool:
    """Mark a notification as read."""
    conn = get_db()
    try:
        conn.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (notif_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def mark_all_notifications_read(user_id: str, role: str) -> bool:
    """Mark all notifications for user/role as read."""
    conn = get_db()
    try:
        conn.execute(
            "UPDATE notifications SET is_read = 1 WHERE user_id = ? OR role_target = ?",
            (user_id, role.lower()),
        )
        conn.commit()
        return True
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Next-ID helpers (CMP-001, TKT-001 …)
# ---------------------------------------------------------------------------

def _next_complaint_id(conn: sqlite3.Connection) -> str:
    """Generate the next complaint ID like CMP-001, CMP-002, …"""
    row = conn.execute("SELECT COUNT(*) AS cnt FROM complaints").fetchone()
    return f"CMP-{row['cnt'] + 1:03d}"


def _next_ticket_id(conn: sqlite3.Connection) -> str:
    """Generate the next ticket ID like TKT-001, TKT-002, …"""
    row = conn.execute("SELECT COUNT(*) AS cnt FROM tickets").fetchone()
    return f"TKT-{row['cnt'] + 1:03d}"


# ---------------------------------------------------------------------------
# Demo data
# ---------------------------------------------------------------------------

def seed_demo_data() -> None:
    """
    Insert 8 realistic demo complaints (is_demo = 1) if none exist yet.
    Includes explicit sanitation & biological hygiene scenarios.
    """
    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT COUNT(*) AS cnt FROM complaints WHERE is_demo = 1"
        ).fetchone()
        if existing["cnt"] > 0:
            return  # demo data already seeded

        now = datetime.now(timezone.utc).isoformat()

        demos: List[Dict[str, Any]] = [
            # 1 ── Critical Electrical
            {
                "student_name": "Arjun Mehta",
                "location": "Academic Block A",
                "room_number": "204",
                "title": "Exposed Electrical Wire Near Classroom 204",
                "description": (
                    "There is an exposed electrical wire hanging from the ceiling "
                    "near the entrance of Classroom 204. The insulation appears "
                    "to have melted and the copper conductor is visible. Students "
                    "have to walk directly under it to enter the room."
                ),
                "category": "Electrical",
                "status": "Pending",
                "priority": "P1 – Critical",
                "priority_reason": "Exposed or faulty electrical components pose an immediate electrocution or fire risk.",
                "assigned_department": "Electrical Maintenance",
                "is_sensitive_hygiene": 0,
                "ai_analysis": json.dumps({
                    "category": "Electrical",
                    "suggested_priority": "P1 – Critical",
                    "explanation": "Exposed live wire presents immediate electrocution hazard.",
                    "recommended_department": "Electrical Maintenance",
                }),
            },
            # 2 ── Critical Sanitation: Overflowing Sanitary Waste Bin
            {
                "student_name": "Diya Patel",
                "location": "Hostel Block A",
                "room_number": "Ground Floor Washroom",
                "title": "Overflowing Sanitary Disposal Bin in Ground Floor Washroom",
                "description": (
                    "The sanitary waste bin in the ground floor girls washroom has been "
                    "overflowing onto the floor. Used sanitary pads are exposed outside the bin, "
                    "creating severe odor and biological contamination risk for residents."
                ),
                "category": "Hygiene & Sanitation",
                "status": "Pending",
                "priority": "P1 – Critical",
                "priority_reason": "Overflowing sanitary disposal bins present severe biohazard exposure, pathogen proliferation, and washroom contamination.",
                "assigned_department": "Housekeeping & Hygiene Operations",
                "is_sensitive_hygiene": 1,
                "ai_analysis": json.dumps({
                    "category": "Hygiene & Sanitation",
                    "suggested_priority": "P1 – Critical",
                    "explanation": "Acute sanitation failure with exposed biological waste requires immediate disinfectant response.",
                    "recommended_department": "Housekeeping & Hygiene Operations",
                }),
            },
            # 3 ── High Sanitation: Missing Sanitary Disposal Bins
            {
                "student_name": "Ananya Sharma",
                "location": "Academic Block 1",
                "room_number": "First Floor Washroom",
                "title": "Missing Sanitary Disposal Facilities in Academic Block 1",
                "description": (
                    "There are no sanitary disposal bins in any of the female stalls on the first floor. "
                    "Students have to carry waste out or risk disposal in standard toilets causing blockages. "
                    "Please install lined disposal bins urgently."
                ),
                "category": "Hygiene & Sanitation",
                "status": "Pending",
                "priority": "P2 – High",
                "priority_reason": "Lack of sanitary disposal infrastructure forces improper disposal, causing severe plumbing blockages and environmental contamination.",
                "assigned_department": "Housekeeping & Hygiene Operations",
                "is_sensitive_hygiene": 1,
                "ai_analysis": json.dumps({
                    "category": "Hygiene & Sanitation",
                    "suggested_priority": "P2 – High",
                    "explanation": "Infrastructural sanitation deficit impacting female students across lecture halls.",
                    "recommended_department": "Housekeeping & Hygiene Operations",
                }),
            },
            # 4 ── High Plumbing
            {
                "student_name": "Priya Sharma",
                "location": "Hostel Block B",
                "room_number": "2nd Floor Washroom",
                "title": "Water Leakage in Second Floor Washroom",
                "description": (
                    "Overhead pipe burst causing severe water pooling on the floor and early mould growth."
                ),
                "category": "Plumbing",
                "status": "Assigned",
                "priority": "P2 – High",
                "priority_reason": "Active water leakage causes progressive structural damage, slipping hazards, and electrical contact risks.",
                "assigned_department": "Plumbing & Sanitation Department",
                "is_sensitive_hygiene": 0,
                "ai_analysis": json.dumps({
                    "category": "Plumbing",
                    "suggested_priority": "P2 – High",
                    "explanation": "Active water leak causing slip hazard and ceiling seepage.",
                    "recommended_department": "Plumbing & Sanitation Department",
                }),
            },
            # 5 ── Medium Routine: Broken Fan
            {
                "student_name": "Rahul Verma",
                "location": "Central Library",
                "room_number": "Reading Room 1",
                "title": "Broken Ceiling Fan in Reading Room",
                "description": "Ceiling fan making clicking noise and not rotating.",
                "category": "Civil Infrastructure",
                "status": "Pending",
                "priority": "P3 – Medium",
                "priority_reason": "Damaged facility fixtures compromise comfort and security without immediate life hazard.",
                "assigned_department": "General Facilities & Carpentry",
                "is_sensitive_hygiene": 0,
                "ai_analysis": json.dumps({
                    "category": "Civil Infrastructure",
                    "suggested_priority": "P3 – Medium",
                    "explanation": "Non-hazardous comfort issue in study area.",
                    "recommended_department": "General Facilities & Carpentry",
                }),
            },
        ]

        for i, d in enumerate(demos, start=1):
            cid = f"CMP-{i:03d}"
            conn.execute(
                """
                INSERT INTO complaints (
                    id, student_name, location, room_number, title, description,
                    category, image_path, status, priority, priority_reason,
                    ai_analysis, assigned_department, is_sensitive_hygiene, created_at, updated_at, is_demo
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    cid, d["student_name"], d["location"], d["room_number"],
                    d["title"], d["description"], d["category"], d["status"],
                    d["priority"], d["priority_reason"], d["ai_analysis"],
                    d["assigned_department"], d.get("is_sensitive_hygiene", 0),
                    now, now
                ),
            )

        conn.commit()
    finally:
        conn.close()
