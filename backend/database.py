"""
FixFirstAI - Database Layer
=============================
Sets up an SQLite database with two tables (complaints & tickets),
seeds realistic demo data, and exposes a helper to get a DB connection.

All queries use parameterized placeholders (?) to prevent SQL injection.
"""

import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional

from backend.config import DATABASE_PATH


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
# Schema creation
# ---------------------------------------------------------------------------

def init_db() -> None:
    """Create the complaints, tickets, and users tables if they don't exist and apply migrations."""
    conn = get_db()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id                  TEXT PRIMARY KEY,
                username            TEXT UNIQUE NOT NULL,
                full_name           TEXT NOT NULL,
                role                TEXT NOT NULL,
                password_hash       TEXT NOT NULL,
                salt                TEXT NOT NULL,
                department_or_hostel TEXT,
                created_at          TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS complaints (
                id              TEXT PRIMARY KEY,
                student_name    TEXT NOT NULL,
                location        TEXT NOT NULL,
                room_number     TEXT,
                title           TEXT NOT NULL,
                description     TEXT NOT NULL,
                category        TEXT NOT NULL,
                image_path      TEXT,
                status          TEXT NOT NULL DEFAULT 'Pending',
                priority        TEXT NOT NULL DEFAULT 'Medium',
                priority_reason TEXT,
                ai_analysis     TEXT,
                assigned_department TEXT,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                is_demo         INTEGER NOT NULL DEFAULT 0,
                student_id      TEXT,
                urgency_rank    INTEGER,
                ranking_score   REAL,
                ranking_reason  TEXT,
                affected_scope  TEXT,
                damage_risk     TEXT
            );

            CREATE TABLE IF NOT EXISTS tickets (
                id              TEXT PRIMARY KEY,
                complaint_id    TEXT NOT NULL,
                location        TEXT NOT NULL,
                issue_summary   TEXT NOT NULL,
                priority        TEXT NOT NULL,
                priority_reason TEXT,
                recommended_action TEXT,
                department      TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'Open',
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                technician_name TEXT,
                root_cause      TEXT,
                preventive_action TEXT,
                safety_signoff  INTEGER NOT NULL DEFAULT 0,
                sla_target_at   TEXT,
                resolved_at     TEXT,
                FOREIGN KEY (complaint_id) REFERENCES complaints(id)
            );
            """
        )

        existing_ticket_cols = {row["name"] for row in conn.execute("PRAGMA table_info(tickets)").fetchall()}
        migration_ticket_cols = [
            ("technician_name", "TEXT"),
            ("root_cause", "TEXT"),
            ("preventive_action", "TEXT"),
            ("safety_signoff", "INTEGER DEFAULT 0"),
            ("sla_target_at", "TEXT"),
            ("resolved_at", "TEXT"),
        ]
        for col_name, col_def in migration_ticket_cols:
            if col_name not in existing_ticket_cols:
                conn.execute(f"ALTER TABLE tickets ADD COLUMN {col_name} {col_def}")

        existing_complaint_cols = {row["name"] for row in conn.execute("PRAGMA table_info(complaints)").fetchall()}
        migration_complaint_cols = [
            ("student_id", "TEXT"),
            ("urgency_rank", "INTEGER"),
            ("ranking_score", "REAL"),
            ("ranking_reason", "TEXT"),
            ("affected_scope", "TEXT"),
            ("damage_risk", "TEXT"),
        ]
        for col_name, col_def in migration_complaint_cols:
            if col_name not in existing_complaint_cols:
                conn.execute(f"ALTER TABLE complaints ADD COLUMN {col_name} {col_def}")

        conn.commit()
    finally:
        conn.close()

    seed_demo_users()


def seed_demo_users() -> None:
    """Seed initial demo accounts for Student and Teacher/Warden roles with secure password hashes."""
    from backend.auth import hash_password

    conn = get_db()
    try:
        now = datetime.now(timezone.utc).isoformat()
        demo_users = [
            {
                "id": "USR-STU-001",
                "username": "student1",
                "full_name": "Aarav Sharma",
                "role": "student",
                "password": "Student@123",
                "department_or_hostel": "Hostel Block B (Room 204)",
            },
            {
                "id": "USR-STU-002",
                "username": "student2",
                "full_name": "Diya Patel",
                "role": "student",
                "password": "Student@123",
                "department_or_hostel": "Hostel Block A (Room 112)",
            },
            {
                "id": "USR-WRD-001",
                "username": "warden1",
                "full_name": "Prof. Rajesh Verma",
                "role": "warden",
                "password": "Warden@123",
                "department_or_hostel": "Chief Warden Office & Estate Admin",
            },
            {
                "id": "USR-TCH-001",
                "username": "teacher1",
                "full_name": "Dr. Sunita Rao",
                "role": "teacher",
                "password": "Teacher@123",
                "department_or_hostel": "Academic Affairs & Maintenance Committee",
            },
        ]

        for u in demo_users:
            existing = conn.execute("SELECT id FROM users WHERE username = ?", (u["username"],)).fetchone()
            if not existing:
                pwd_hash, salt = hash_password(u["password"])
                conn.execute(
                    """
                    INSERT INTO users (id, username, full_name, role, password_hash, salt, department_or_hostel, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (u["id"], u["username"], u["full_name"], u["role"], pwd_hash, salt, u["department_or_hostel"], now),
                )
        conn.commit()
    finally:
        conn.close()


def get_user_by_username(username: str):
    """Fetch user record by username."""
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_user_by_id(user_id: str):
    """Fetch user record by ID."""
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

# ---------------------------------------------------------------------------
# Next-ID helpers  (CMP-001, TKT-001 …)
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
    This makes the dashboard look populated on first launch.
    """
    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT COUNT(*) AS cnt FROM complaints WHERE is_demo = 1"
        ).fetchone()
        if existing["cnt"] > 0:
            return  # demo data already seeded

        now = datetime.now(timezone.utc).isoformat()

        demos: list[dict[str, Any]] = [
            # 1 ── Critical
            {
                "student_name": "Arjun Mehta",
                "location": "Academic Block A",
                "room_number": "204",
                "title": "Exposed Electrical Wire Near Classroom 204",
                "description": (
                    "There is an exposed electrical wire hanging from the ceiling "
                    "near the entrance of Classroom 204. The insulation appears "
                    "to have melted and the copper conductor is visible. Students "
                    "have to walk directly under it to enter the room. This is "
                    "extremely dangerous, especially during the monsoon season when "
                    "the corridor gets wet."
                ),
                "category": "Electrical Safety",
                "status": "Pending",
                "priority": "Critical",
                "priority_reason": (
                    "Exposed or faulty electrical components pose an immediate "
                    "electrocution or fire risk."
                ),
                "assigned_department": "Electrical & Maintenance",
                "ai_analysis": json.dumps({
                    "category": "Electrical Safety",
                    "summary": "Exposed live wire near high-traffic classroom entrance.",
                    "risk_indicators": [
                        "Exposed copper conductor",
                        "Melted insulation",
                        "High foot traffic area",
                        "Monsoon water ingress risk",
                    ],
                    "suggested_priority": "Critical",
                    "explanation": (
                        "An exposed electrical conductor in a student corridor "
                        "presents immediate electrocution risk, amplified by "
                        "seasonal water exposure."
                    ),
                    "recommended_department": "Electrical & Maintenance",
                    "suggested_action": (
                        "Isolate the circuit immediately, cordon off the area, "
                        "and dispatch a licensed electrician."
                    ),
                }),
            },
            # 2 ── High
            {
                "student_name": "Priya Sharma",
                "location": "Hostel Block B",
                "room_number": "2nd Floor Washroom",
                "title": "Water Leakage in Second Floor Washroom",
                "description": (
                    "The second-floor washroom in Hostel Block B has a severe "
                    "water leakage from the overhead pipe. Water pools on the "
                    "floor making it very slippery. The leak has been ongoing "
                    "for three days and the adjacent wall is showing damp patches "
                    "and early mould growth."
                ),
                "category": "Water Leakage",
                "status": "Assigned",
                "priority": "High",
                "priority_reason": (
                    "Water leakage can cause structural damage, mould growth, "
                    "and slipping hazards."
                ),
                "assigned_department": "Plumbing & Maintenance",
                "ai_analysis": json.dumps({
                    "category": "Water Leakage",
                    "summary": "Persistent overhead pipe leak causing floor pooling and mould.",
                    "risk_indicators": [
                        "Continuous leak for 3 days",
                        "Floor pooling / slip hazard",
                        "Damp patches on wall",
                        "Early mould growth",
                    ],
                    "suggested_priority": "High",
                    "explanation": (
                        "Ongoing water leak creates slip risk for hostel residents "
                        "and promotes mould, which is a health hazard."
                    ),
                    "recommended_department": "Plumbing & Maintenance",
                    "suggested_action": (
                        "Shut off the water supply to the affected section, repair "
                        "the pipe, dry the area, and treat the mould."
                    ),
                }),
            },
            # 3 ── Medium
            {
                "student_name": "Rahul Kumar",
                "location": "Lecture Hall Complex",
                "room_number": "301",
                "title": "Broken Ceiling Fan in Lecture Hall 301",
                "description": (
                    "One of the ceiling fans in Lecture Hall 301 has stopped "
                    "working and is making a grinding noise when switched on. "
                    "The hall becomes uncomfortably hot during afternoon lectures "
                    "because of the reduced air circulation. The fan blade also "
                    "appears slightly bent."
                ),
                "category": "Infrastructure",
                "status": "In Progress",
                "priority": "Medium",
                "priority_reason": (
                    "Damaged infrastructure reduces safety and comfort but is "
                    "not immediately life-threatening."
                ),
                "assigned_department": "Civil & Maintenance",
                "ai_analysis": json.dumps({
                    "category": "Infrastructure",
                    "summary": "Non-functional ceiling fan with grinding noise and bent blade.",
                    "risk_indicators": [
                        "Grinding noise indicates motor damage",
                        "Bent blade — potential to detach",
                        "Reduced ventilation in large hall",
                    ],
                    "suggested_priority": "Medium",
                    "explanation": (
                        "A damaged fan blade could detach at high speed. Repair "
                        "should be scheduled promptly but is not an emergency."
                    ),
                    "recommended_department": "Civil & Maintenance",
                    "suggested_action": (
                        "Disable the fan, inspect the motor and blades, and "
                        "replace the unit if necessary."
                    ),
                }),
            },
            # 4 ── Critical
            {
                "student_name": "Ananya Gupta",
                "location": "Science Building",
                "room_number": "Ground Floor Corridor",
                "title": "Emergency Exit Blocked by Furniture",
                "description": (
                    "The emergency exit on the ground floor of the Science "
                    "Building is completely blocked by old desks, chairs, and "
                    "lab equipment that have been stored in front of the door. "
                    "The exit sign is still lit but the door cannot be opened. "
                    "This building houses chemistry labs with flammable materials."
                ),
                "category": "Emergency Exit",
                "status": "Pending",
                "priority": "Critical",
                "priority_reason": (
                    "A blocked emergency exit can trap occupants during a fire "
                    "or other emergency."
                ),
                "assigned_department": "Safety & Compliance",
                "ai_analysis": json.dumps({
                    "category": "Emergency Exit",
                    "summary": "Ground-floor fire exit completely obstructed by stored furniture.",
                    "risk_indicators": [
                        "Exit physically impassable",
                        "Chemistry labs with flammable chemicals nearby",
                        "Violates fire safety code",
                    ],
                    "suggested_priority": "Critical",
                    "explanation": (
                        "Blocked fire exits in a building with chemical labs "
                        "could result in fatalities during an emergency."
                    ),
                    "recommended_department": "Safety & Compliance",
                    "suggested_action": (
                        "Remove all obstructions immediately, conduct a full "
                        "fire-exit audit of the building, and issue a violation "
                        "notice to the department responsible."
                    ),
                }),
            },
            # 5 ── Low
            {
                "student_name": "Vikram Singh",
                "location": "Computer Lab",
                "room_number": "Lab 102",
                "title": "Broken Chair in Computer Lab",
                "description": (
                    "One of the revolving chairs in Computer Lab 102 has a "
                    "broken armrest and the height adjustment lever is stuck. "
                    "The chair is still usable but uncomfortable. Students "
                    "avoid sitting at that workstation."
                ),
                "category": "Infrastructure",
                "status": "Pending",
                "priority": "Low",
                "priority_reason": (
                    "Minor cosmetic or furniture damage with negligible safety impact."
                ),
                "assigned_department": "General Maintenance",
                "ai_analysis": json.dumps({
                    "category": "Infrastructure",
                    "summary": "Chair with broken armrest and stuck height lever.",
                    "risk_indicators": [
                        "Broken armrest — minor injury if leaned on",
                        "Ergonomic discomfort",
                    ],
                    "suggested_priority": "Low",
                    "explanation": (
                        "Furniture damage that does not pose a significant safety "
                        "risk. Can be handled in routine maintenance."
                    ),
                    "recommended_department": "General Maintenance",
                    "suggested_action": (
                        "Tag the chair for replacement during the next furniture "
                        "procurement cycle."
                    ),
                }),
            },
            # 6 ── Medium
            {
                "student_name": "Sneha Patel",
                "location": "Main Academic Building",
                "room_number": "Ground Floor Lobby",
                "title": "Drinking Water Cooler Not Working",
                "description": (
                    "The main drinking water cooler in the ground floor lobby of "
                    "the academic building has stopped cooling water. The RO "
                    "filter indicator shows 'replace filter'. Many students rely "
                    "on this cooler between classes. The nearest alternative is "
                    "two buildings away."
                ),
                "category": "Drinking Water",
                "status": "Assigned",
                "priority": "Medium",
                "priority_reason": (
                    "Access to safe drinking water is essential; outages affect "
                    "many students."
                ),
                "assigned_department": "Facilities Management",
                "ai_analysis": json.dumps({
                    "category": "Drinking Water",
                    "summary": "Primary water cooler non-functional; filter needs replacement.",
                    "risk_indicators": [
                        "RO filter expired — water quality concern",
                        "Cooling unit failure",
                        "No nearby alternative",
                    ],
                    "suggested_priority": "Medium",
                    "explanation": (
                        "Disrupted access to clean drinking water for a large "
                        "student population. Health risk if expired filter is "
                        "still passing water."
                    ),
                    "recommended_department": "Facilities Management",
                    "suggested_action": (
                        "Replace the RO filter immediately, diagnose the cooling "
                        "unit, and set up a temporary water dispenser."
                    ),
                }),
            },
            # 7 ── Medium
            {
                "student_name": "Karan Joshi",
                "location": "Central Library",
                "room_number": "Reading Room 2",
                "title": "Flickering Lights in Library Reading Room",
                "description": (
                    "Several tube lights in Reading Room 2 of the Central Library "
                    "have been flickering intermittently for the past week. The "
                    "constant flickering causes eye strain and headaches, making "
                    "it difficult for students to study. Some students have "
                    "reported dizziness."
                ),
                "category": "Lighting",
                "status": "Pending",
                "priority": "Medium",
                "priority_reason": (
                    "Poor lighting increases the risk of trips, falls, and "
                    "security incidents."
                ),
                "assigned_department": "Electrical & Maintenance",
                "ai_analysis": json.dumps({
                    "category": "Lighting",
                    "summary": "Multiple flickering tube lights in high-use library reading room.",
                    "risk_indicators": [
                        "Eye strain and headaches reported",
                        "Dizziness in some students",
                        "Possible ballast or wiring fault",
                    ],
                    "suggested_priority": "Medium",
                    "explanation": (
                        "Flickering lights indicate a wiring or ballast issue "
                        "that should be fixed to prevent discomfort and a "
                        "potential electrical fault."
                    ),
                    "recommended_department": "Electrical & Maintenance",
                    "suggested_action": (
                        "Replace the faulty tube lights and ballasts, and inspect "
                        "the wiring circuit for the room."
                    ),
                }),
            },
            # 8 ── High
            {
                "student_name": "Divya Reddy",
                "location": "Canteen Area",
                "room_number": "Main Entrance",
                "title": "Slippery Floor Near Canteen Entrance",
                "description": (
                    "The tiled floor near the canteen entrance becomes extremely "
                    "slippery during and after meals due to food spills and "
                    "water splashes. Two students slipped and fell yesterday. "
                    "There are no wet-floor warning signs or anti-slip mats in "
                    "the area."
                ),
                "category": "Hygiene",
                "status": "Pending",
                "priority": "High",
                "priority_reason": (
                    "Slippery surfaces are a leading cause of injury on campus."
                ),
                "assigned_department": "Housekeeping & Safety",
                "ai_analysis": json.dumps({
                    "category": "Hygiene",
                    "summary": "Recurring slip hazard at canteen entrance with reported falls.",
                    "risk_indicators": [
                        "Two students already fell",
                        "No wet-floor signs",
                        "No anti-slip mats",
                        "Recurring during meal times",
                    ],
                    "suggested_priority": "High",
                    "explanation": (
                        "Injuries have already occurred. Immediate measures "
                        "are needed to prevent further falls."
                    ),
                    "recommended_department": "Housekeeping & Safety",
                    "suggested_action": (
                        "Place wet-floor signs immediately, install permanent "
                        "anti-slip mats, and schedule frequent mopping during "
                        "meal hours."
                    ),
                }),
            },
        ]

        for i, d in enumerate(demos, start=1):
            cid = f"CMP-{i:03d}"
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
                    cid,
                    d["student_name"],
                    d["location"],
                    d["room_number"],
                    d["title"],
                    d["description"],
                    d["category"],
                    None,  # image_path
                    d["status"],
                    d["priority"],
                    d["priority_reason"],
                    d["ai_analysis"],
                    d["assigned_department"],
                    now,
                    now,
                    1,  # is_demo = True
                ),
            )

        conn.commit()
        print(f"  [OK] Seeded {len(demos)} demo complaints into the database.")

        # Also seed demo tickets if none exist
        tkt_count = conn.execute("SELECT COUNT(*) AS cnt FROM tickets").fetchone()["cnt"]
        if tkt_count == 0:
            from datetime import timedelta
            demo_tickets = [
                {
                    "id": "TKT-001",
                    "complaint_id": "CMP-001",
                    "location": "Academic Block A, Room 204",
                    "issue_summary": "Exposed Electrical Wire Near Classroom 204",
                    "priority": "Critical",
                    "priority_reason": "Immediate electrocution or electrical fire risk.",
                    "recommended_action": "Isolate circuit breaker, cordon off corridor, replace wiring conduit.",
                    "department": "Electrical & Maintenance",
                    "status": "In Progress",
                    "technician_name": "Suresh Sharma (Senior Electrician)",
                    "root_cause": "Conduit degradation caused by monsoon moisture seepage.",
                    "preventive_action": "Install weather-sealed IP65 conduit and test residual current breaker.",
                    "safety_signoff": 1,
                    "sla_target_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
                    "resolved_at": None,
                },
                {
                    "id": "TKT-002",
                    "complaint_id": "CMP-002",
                    "location": "Hostel Block B, 2nd Floor Washroom",
                    "issue_summary": "Water Leakage in Second Floor Washroom",
                    "priority": "High",
                    "priority_reason": "Water pooling causes slip-and-fall hazard and promotes mould.",
                    "recommended_action": "Isolate shutoff valve, re-seal flange joint, dry tiles.",
                    "department": "Plumbing & Maintenance",
                    "status": "Resolved & Verified",
                    "technician_name": "Ramesh Patel (Plumbing Specialist)",
                    "root_cause": "Worn rubber gasket on main overhead distribution riser.",
                    "preventive_action": "Replaced entire manifold gasket set with reinforced EPDM seals.",
                    "safety_signoff": 1,
                    "sla_target_at": (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat(),
                    "resolved_at": (datetime.now(timezone.utc) - timedelta(hours=14)).isoformat(),
                },
                {
                    "id": "TKT-003",
                    "complaint_id": "CMP-004",
                    "location": "Science Building, Ground Floor",
                    "issue_summary": "Emergency Exit Blocked by Furniture",
                    "priority": "Critical",
                    "priority_reason": "Fire egress blocked in building containing chemical laboratories.",
                    "recommended_action": "Remove obstructions immediately, inspect fire doors.",
                    "department": "Safety & Compliance",
                    "status": "Open",
                    "technician_name": "Unassigned (Dispatched)",
                    "root_cause": "Unauthorized laboratory furniture storage in egress pathway.",
                    "preventive_action": "Install permanent 'Keep Clear - Fire Exit' floor stencils.",
                    "safety_signoff": 0,
                    "sla_target_at": (datetime.now(timezone.utc) + timedelta(hours=1, minutes=15)).isoformat(),
                    "resolved_at": None,
                }
            ]

            for t in demo_tickets:
                conn.execute(
                    """
                    INSERT INTO tickets
                        (id, complaint_id, location, issue_summary, priority,
                         priority_reason, recommended_action, department, status,
                         created_at, updated_at, technician_name, root_cause,
                         preventive_action, safety_signoff, sla_target_at, resolved_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        t["id"], t["complaint_id"], t["location"], t["issue_summary"],
                        t["priority"], t["priority_reason"], t["recommended_action"],
                        t["department"], t["status"], now, now, t["technician_name"],
                        t["root_cause"], t["preventive_action"], t["safety_signoff"],
                        t["sla_target_at"], t["resolved_at"]
                    )
                )
            conn.commit()
            print(f"  [OK] Seeded {len(demo_tickets)} proactive maintenance tickets with SLA tracking.")
    finally:
        conn.close()
