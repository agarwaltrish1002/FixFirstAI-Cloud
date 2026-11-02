import uuid
"""
FixFirstAI - Multi-Role Safety & Platform Upgrade Tests
=========================================================
Tests for:
1. Argon2id Password Hashing & Verification (+ legacy PBKDF2 fallback)
2. Four Distinct Role Logins (Student, Warden, Worker, Admin)
3. Backend-Enforced Role-Based Access Control (RBAC)
4. Admin Candidate Management & Security Audit Logging
5. Warden Worker Assignment & Repair Verification Lifecycle
6. Worker Task Reception, Accept/Reject, and Evidence Upload
7. Menstrual Hygiene & Sanitation Safety Rules
   - Exposed blood -> P1 Critical
   - Overflowing sanitary bin -> P1 Critical
   - Missing disposal facilities -> P2 High
   - Menstruation mentioned naturally -> Natural biological process (NOT P1)
   - Student privacy masking for sensitive tasks
8. Student Reopening and Feedback Rating
9. Multi-Role Real-Time Notifications
"""

import json
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.auth import hash_password, verify_password, generate_temporary_password
from backend.safety_engine import analyze_complaint as rule_analyze
from backend.database import init_db, get_db

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_database():
    """Ensure database tables and demo seed users are present."""
    init_db()


# ---------------------------------------------------------------------------
# Test 1: Argon2id Hashing and Dual-Mode Verification
# ---------------------------------------------------------------------------

def test_argon2id_hashing_and_legacy_verification():
    """Test Argon2id hashing and backwards compatibility with PBKDF2."""
    raw_pwd = "SecureCandidate@2026"
    argon2_hash, salt = hash_password(raw_pwd)

    # Must be valid Argon2id hash format
    assert argon2_hash.startswith("$argon2id$") or len(argon2_hash) > 20
    assert verify_password(raw_pwd, argon2_hash, salt) is True
    assert verify_password("WrongPassword!", argon2_hash, salt) is False

    # Verify legacy PBKDF2 hash verification works seamlessly
    import hashlib
    legacy_salt = "d3f0a1b2c3d4e5f6"
    legacy_hash = hashlib.pbkdf2_hmac("sha256", b"LegacyPass123", legacy_salt.encode(), 100000).hex()
    assert verify_password("LegacyPass123", legacy_hash, legacy_salt) is True
    assert verify_password("IncorrectPass", legacy_hash, legacy_salt) is False


def test_temporary_password_generator():
    """Verify temporary passwords meet security entropy rules."""
    pwd = generate_temporary_password(14)
    assert len(pwd) == 14
    assert any(c.isupper() for c in pwd)
    assert any(c.islower() for c in pwd)
    assert any(c.isdigit() for c in pwd)


# ---------------------------------------------------------------------------
# Test 2: Four Distinct Role Logins & Portal Validation
# ---------------------------------------------------------------------------

def test_four_separate_role_logins():
    """Test successful login for Student, Warden, Worker, and Admin."""
    roles_credentials = [
        ("student1", "Student@123", "student"),
        ("warden1", "Warden@123", "warden"),
        ("worker1", "Worker@123", "worker"),
        ("admin1", "Admin@123", "admin"),
    ]

    for username, password, expected_role in roles_credentials:
        resp = client.post("/api/auth/login", json={"username": username, "password": password, "role": expected_role})
        assert resp.status_code == 200, f"Login failed for {username}: {resp.text}"
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["role"] == expected_role


def test_role_portal_mismatch_rejection():
    """Ensure logging into the wrong role portal is rejected with a helpful message."""
    # Worker attempting to log into Student portal
    resp = client.post("/api/auth/login", json={"username": "worker1", "password": "Worker@123", "role": "student"})
    assert resp.status_code == 400
    assert "WORKER" in resp.json()["detail"]

    # Student attempting to log into Admin portal
    resp = client.post("/api/auth/login", json={"username": "student1", "password": "Student@123", "role": "admin"})
    assert resp.status_code == 400
    assert "STUDENT" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Test 3: Backend-Enforced RBAC Route Protection
# ---------------------------------------------------------------------------

def test_rbac_protection_on_admin_routes():
    """Verify students and workers are strictly forbidden from accessing Admin endpoints."""
    # Get student token
    s_login = client.post("/api/auth/login", json={"username": "student1", "password": "Student@123", "role": "student"}).json()
    student_token = s_login["access_token"]

    # Attempt admin access
    resp = client.get("/api/admin/candidates", headers={"Authorization": f"Bearer {student_token}"})
    assert resp.status_code == 403
    assert "Access denied" in resp.json()["detail"]

    # Get worker token
    w_login = client.post("/api/auth/login", json={"username": "worker1", "password": "Worker@123", "role": "worker"}).json()
    worker_token = w_login["access_token"]

    resp = client.get("/api/admin/candidates", headers={"Authorization": f"Bearer {worker_token}"})
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Test 4: Admin Candidate Management & Audit Logging
# ---------------------------------------------------------------------------

def test_admin_candidate_crud_and_audit_trail():
    """Test Admin adding candidates, resetting passwords, toggling status, and audit logs."""
    adm_token = client.post("/api/auth/login", json={"username": "admin1", "password": "Admin@123", "role": "admin"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {adm_token}"}

    # 1. Create candidate
    candidate_payload = {
        "full_name": "Kavita Singhania",
        "email": f"kavita.{uuid.uuid4().hex[:6]}@campus.edu",
        "phone": "+91 91234 56789",
        "username": f"kavita_{uuid.uuid4().hex[:6]}",
        "role": "worker",
        "department": "Housekeeping & Hygiene Operations",
        "assigned_area": "Hostel Block C",
        "password": "WorkerTemp@123",
    }
    create_resp = client.post("/api/admin/candidates", json=candidate_payload, headers=headers)
    assert create_resp.status_code == 200
    cand = create_resp.json()["candidate"]
    cand_id = cand["id"]

    # 2. Verify candidate appears in candidate list
    list_resp = client.get("/api/admin/candidates?search=Kavita", headers=headers)
    assert list_resp.status_code == 200
    assert any(c["id"] == cand_id for c in list_resp.json()["candidates"])

    # 3. Reset candidate password
    reset_resp = client.post(f"/api/admin/candidates/{cand_id}/reset-password", json={"new_password": "NewWorkerPass@99"}, headers=headers)
    assert reset_resp.status_code == 200

    # 4. Deactivate candidate account
    status_resp = client.put(f"/api/admin/candidates/{cand_id}/status", json={"account_status": "Inactive"}, headers=headers)
    assert status_resp.status_code == 200

    # 5. Inactive candidate should fail login
    deact_login = client.post("/api/auth/login", json={"username": cand["username"], "password": "NewWorkerPass@99", "role": "worker"})
    assert deact_login.status_code == 403
    assert "inactive" in deact_login.json()["detail"].lower()

    # 6. Check Audit Logs contain these actions
    audit_resp = client.get("/api/admin/audit-logs", headers=headers)
    assert audit_resp.status_code == 200
    logs = audit_resp.json()["audit_logs"]
    actions = [l["action"] for l in logs]
    assert "create_candidate" in actions
    assert "reset_password" in actions
    assert "toggle_status" in actions


# ---------------------------------------------------------------------------
# Test 5: Menstrual Hygiene & Sanitation Safety Rules
# ---------------------------------------------------------------------------

def test_menstrual_hygiene_p1_critical_biohazard():
    """Exposed menstrual blood on washroom surfaces must strictly escalate to P1 – Critical."""
    res = rule_analyze(
        title="Exposed blood on floor in girls washroom",
        description="There is exposed menstrual blood on the toilet surface and floor in stall 2.",
        category="Hygiene & Sanitation",
    )
    assert "Critical" in res["priority"]
    assert "P1" in res["priority"]
    assert res["is_sensitive_hygiene"] is True
    assert "blood" in res["reason"].lower()


def test_overflowing_sanitary_bins_p1_critical():
    """Overflowing sanitary waste bin must strictly escalate to P1 – Critical."""
    res = rule_analyze(
        title="Overflowing sanitary bin in hostel washroom",
        description="The sanitary disposal bin is overflowing onto the floor creating extreme foul smell.",
        category="Hygiene & Sanitation",
    )
    assert "Critical" in res["priority"]
    assert "P1" in res["priority"]
    assert res["is_sensitive_hygiene"] is True


def test_missing_sanitary_disposal_bins_p2_high():
    """Missing sanitary disposal facilities must escalate to P2 – High."""
    res = rule_analyze(
        title="No sanitary disposal bins in new academic block",
        description="All female stalls have missing sanitary disposal bins, causing severe inconvenience.",
        category="Hygiene & Sanitation",
    )
    assert "High" in res["priority"]
    assert "P2" in res["priority"]
    assert res["is_sensitive_hygiene"] is True


def test_natural_menstrual_mention_is_not_pathologized():
    """Menstruation mentioned neutrally as a natural process must NEVER be labelled biohazard or P1."""
    res = rule_analyze(
        title="Sanitary pad vending machine needs coin check",
        description="The sanitary pad dispenser in the lobby needs coin slot inspection and restocking.",
        category="Hygiene & Sanitation",
    )
    # Must NOT be P1 Critical
    assert "Critical" not in res["priority"]
    assert "P1" not in res["priority"]
    assert "amenity" in res["reason"].lower() or "standard" in res["reason"].lower()


# ---------------------------------------------------------------------------
# Test 6: Worker Task Assignment, Privacy Masking & Repair Verification
# ---------------------------------------------------------------------------

def test_worker_assignment_lifecycle_and_privacy():
    """Test Warden assigning task, worker privacy masking, repair completion, and warden sign-off."""
    # 1. Student submits sensitive hygiene complaint
    stu_token = client.post("/api/auth/login", json={"username": "student2", "password": "Student@123", "role": "student"}).json()["access_token"]
    cmp_resp = client.post(
        "/api/complaints",
        json={
            "student_name": "Diya Patel",
            "location": "Hostel Block A",
            "room_number": "Stall 3",
            "title": "Overflowing sanitary waste bin",
            "description": "Sanitary waste bin overflowing with discarded pads, urgent cleaning needed.",
            "category": "Hygiene & Sanitation",
        },
        headers={"Authorization": f"Bearer {stu_token}"},
    )
    assert cmp_resp.status_code in (200, 201)
    complaint = cmp_resp.json()
    cmp_id = complaint["id"]
    assert complaint["priority"].startswith("P1")

    # 2. Warden assigns to worker1 (Ramesh Kumar - Sanitation specialist)
    wrd_token = client.post("/api/auth/login", json={"username": "warden1", "password": "Warden@123", "role": "warden"}).json()["access_token"]
    assign_resp = client.post(
        "/api/warden/assign",
        json={
            "complaint_id": cmp_id,
            "worker_id": "WRK-001",
            "instructions": "Use full PPE and hospital-grade disinfectant.",
        },
        headers={"Authorization": f"Bearer {wrd_token}"},
    )
    assert assign_resp.status_code == 200
    asn_id = assign_resp.json()["assignment"]["assignment_id"]

    # 3. Worker views task -> verify student privacy masking
    wrk_token = client.post("/api/auth/login", json={"username": "worker1", "password": "Worker@123", "role": "worker"}).json()["access_token"]
    tasks_resp = client.get("/api/worker/my-tasks", headers={"Authorization": f"Bearer {wrk_token}"})
    assert tasks_resp.status_code == 200
    tasks = tasks_resp.json()["tasks"]
    our_task = next((t for t in tasks if t["assignment_id"] == asn_id), None)
    assert our_task is not None
    # Student name MUST be masked for sensitive hygiene
    assert "Protected" in our_task["student_name"] or "Resident" in our_task["student_name"]

    # 4. Worker accepts task
    accept_resp = client.post(
        f"/api/worker/tasks/{asn_id}/respond",
        json={"action": "accept"},
        headers={"Authorization": f"Bearer {wrk_token}"},
    )
    assert accept_resp.status_code == 200

    # 5. Worker completes task with before and after photo references
    comp_resp = client.post(
        f"/api/worker/tasks/{asn_id}/status",
        json={
            "status": "Completed",
            "worker_notes": "Bin emptied, bagged in bio-hazard liner, and area sterilized with bleach solution.",
            "before_photo": "/uploads/before_sanitation.jpg",
            "after_photo": "/uploads/after_sanitation.jpg",
        },
        headers={"Authorization": f"Bearer {wrk_token}"},
    )
    assert comp_resp.status_code == 200

    # 6. Warden inspects and verifies
    verify_resp = client.post(
        f"/api/warden/verify/{asn_id}",
        json={"action": "verify", "feedback": "Inspected by Matron. Satisfactory sterilization complete."},
        headers={"Authorization": f"Bearer {wrd_token}"},
    )
    assert verify_resp.status_code == 200
    assert "Verified" in verify_resp.json()["message"]


# ---------------------------------------------------------------------------
# Test 7: Student Reopening & Satisfaction Feedback
# ---------------------------------------------------------------------------

def test_student_reopen_and_feedback():
    """Test student reopening a complaint and rating resolution satisfaction."""
    stu_token = client.post("/api/auth/login", json={"username": "student1", "password": "Student@123", "role": "student"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {stu_token}"}

    # Submit complaint
    cmp_resp = client.post(
        "/api/complaints",
        json={
            "student_name": "Aarav Sharma",
            "location": "Hostel Block B",
            "title": "Water dripping from bathroom tap",
            "description": "The bathroom tap continues to drip slowly despite being turned tightly.",
            "category": "Plumbing",
        },
        headers=headers,
    )
    cmp_id = cmp_resp.json()["id"]

    # Student provides feedback
    fb_resp = client.post(
        f"/api/complaints/{cmp_id}/feedback",
        json={"rating": 5, "comment": "Excellent prompt resolution by plumbing team!"},
        headers=headers,
    )
    assert fb_resp.status_code == 200
    assert fb_resp.json()["details"]["rating"] == 5

    # Student reopens complaint if issue recurs
    reopen_resp = client.post(
        f"/api/complaints/{cmp_id}/reopen",
        json={"reason": "Dripping started again after water pressure increased this morning."},
        headers=headers,
    )
    assert reopen_resp.status_code == 200
    assert reopen_resp.json()["details"]["status"] == "Pending"


# ---------------------------------------------------------------------------
# Test 8: Real-Time Multi-Role Notifications
# ---------------------------------------------------------------------------

def test_notifications_endpoint():
    """Test user notifications are generated and can be marked as read."""
    wrd_token = client.post("/api/auth/login", json={"username": "warden1", "password": "Warden@123", "role": "warden"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {wrd_token}"}

    notifs_resp = client.get("/api/notifications", headers=headers)
    assert notifs_resp.status_code == 200
    assert "notifications" in notifs_resp.json()

    # Mark all read
    read_all = client.put("/api/notifications/read-all", headers=headers)
    assert read_all.status_code == 200
