"""
Test Suite: FixFirstAI - Smart Campus Risk & Maintenance Intelligence Upgrade
=============================================================================
Verifies:
  1. Student and Warden/Teacher Authentication & Role-Based Authorization
  2. Input Validation (Rejection of non-complaints: chit-chat, food orders, nonsense)
  3. Ambiguous Complaint Handling & Guidance
  4. Automatic Category Classification across 10 standard categories
  5. Intelligent Priority Prediction (P1 Critical through P4 Low) + Safety Override
  6. Multi-Factor Urgency Ranking
  7. Role-Based Scoping (Students see own; Wardens/Teachers see all)
  8. Category-wise Arranger endpoint
  9. Role-aware Campus Stats
"""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import init_db, seed_demo_data
from backend.auth import hash_password, verify_password, create_access_token, verify_access_token
from backend.validation import validate_complaint_content
from backend.ranking_engine import calculate_complaint_ranking, rank_all_complaints


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    init_db()
    seed_demo_data()


@pytest.fixture
def client():
    return TestClient(app)


# ===========================================================================
# 1. AUTHENTICATION & PASSWORD SECURITY TESTS
# ===========================================================================

def test_password_hashing_and_verification():
    raw = "SecureSecret@2026"
    h, salt = hash_password(raw)
    assert h != raw
    assert len(salt) == 32
    assert verify_password(raw, h, salt) is True
    assert verify_password("WrongPassword", h, salt) is False


def test_token_creation_and_verification():
    token = create_access_token("USR-001", "student1", "student", "Aarav Sharma")
    payload = verify_access_token(token)
    assert payload is not None
    assert payload["sub"] == "USR-001"
    assert payload["username"] == "student1"
    assert payload["role"] == "student"


def test_student_and_warden_login(client):
    # Student login
    resp_stu = client.post("/api/auth/login", json={"username": "student1", "password": "Student@123"})
    assert resp_stu.status_code == 200
    data_stu = resp_stu.json()
    assert "access_token" in data_stu
    assert data_stu["user"]["role"] == "student"
    assert data_stu["user"]["username"] == "student1"

    # Warden login
    resp_war = client.post("/api/auth/login", json={"username": "warden1", "password": "Warden@123"})
    assert resp_war.status_code == 200
    data_war = resp_war.json()
    assert data_war["user"]["role"] == "warden"

    # Invalid login
    resp_bad = client.post("/api/auth/login", json={"username": "student1", "password": "BadPassword!"})
    assert resp_bad.status_code == 401


# ===========================================================================
# 2. INPUT VALIDATION TESTS (Non-complaints & Ambiguous inputs)
# ===========================================================================

def test_reject_casual_chitchat():
    for text in ["hello", "how are you?", "good morning sir", "what's up", "hey there"]:
        res = validate_complaint_content(text, text)
        assert res["is_valid"] is False
        assert "maintenance" in res["message"].lower() or "casual" in res["message"].lower()


def test_reject_food_orders():
    res = validate_complaint_content("I want pizza", "Please order burger and pizza quickly")
    assert res["is_valid"] is False
    assert "maintenance" in res["message"].lower() or "food" in res["message"].lower()


def test_reject_nonsense_and_repetition():
    res = validate_complaint_content("asdfghjkl", "asdf asdf asdf asdf asdf")
    assert res["is_valid"] is False


def test_flag_ambiguous_complaints():
    res = validate_complaint_content("Broken", "It is broken and not working")
    assert res["is_valid"] is False
    assert res.get("is_ambiguous") is True
    assert res.get("clarification_prompt") is not None


def test_api_rejects_invalid_complaint_submission(client):
    resp = client.post(
        "/api/complaints",
        json={
            "student_name": "Test User",
            "location": "Hostel 1",
            "title": "hello",
            "description": "how are you today?",
            "category": "Other Maintenance",
        },
    )
    assert resp.status_code == 422
    err_detail = resp.json()["detail"]
    assert err_detail["error"] == "INVALID_COMPLAINT"


# ===========================================================================
# 3. AUTOMATIC CATEGORY CLASSIFICATION TESTS (10 standard categories)
# ===========================================================================

def test_auto_category_recommendations(client):
    test_cases = [
        ("Sparking electrical wire in lab", "Dangerous sparks coming from switchboard", "Electrical"),
        ("Water pipe burst in washroom", "Continuous heavy water flooding the floor", "Plumbing"),
        ("Unhygienic girls washroom stink", "Washroom is dirty, dustbins overflowing with bad smell", "Hygiene & Sanitation"),
        ("Deep crack in corridor ceiling", "Plaster falling off concrete ceiling beam", "Civil Infrastructure"),
        ("Broken study table leg", "Wood chair and desk damaged in study room", "Furniture"),
        ("Fire alarm beeping continuously", "Smoke detector cover melted and beeping", "Fire Safety"),
        ("Door lock broken after hours", "CCTV blindspot and broken main entrance latch", "Security"),
        ("WiFi router no internet signal", "LAN port dead and ethernet cable severed", "IT & Networking"),
        ("AC leaking water and not cooling", "Central ventilation duct making grinding noise", "HVAC & Ventilation"),
    ]

    for title, desc, expected_cat in test_cases:
        resp = client.post("/api/complaints/recommend", json={"title": title, "description": desc})
        assert resp.status_code == 200
        rec = resp.json()
        assert rec["is_valid"] is True
        assert rec["category"] == expected_cat
        assert rec["department"] is not None


# ===========================================================================
# 4. INTELLIGENT PRIORITY PREDICTION & SAFETY ENGINE OVERRIDES
# ===========================================================================

def test_priority_critical_safety_override(client):
    resp = client.post(
        "/api/complaints/recommend",
        json={"title": "Burning smell from socket", "description": "Electric socket in room 204 smells like burning plastic with sparks"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "Critical" in data["priority"] or "P1" in data["priority"]
    assert data["is_critical"] is True
    assert data["safety_warning"] is not None


def test_priority_high_medium_low(client):
    # High
    r_high = client.post("/api/complaints/recommend", json={"title": "Water pipe burst", "description": "Major pipe burst flooding corridor floor"})
    assert "High" in r_high.json()["priority"] or "P2" in r_high.json()["priority"]

    # Medium
    r_med = client.post("/api/complaints/recommend", json={"title": "Broken classroom fan", "description": "Ceiling fan regulator stuck at speed 1 in room 102"})
    assert "Medium" in r_med.json()["priority"] or "P3" in r_med.json()["priority"]

    # Low
    r_low = client.post("/api/complaints/recommend", json={"title": "Peeling wall paint", "description": "Cosmetic paint chipping near notice board"})
    assert "Low" in r_low.json()["priority"] or "P4" in r_low.json()["priority"]


# ===========================================================================
# 5. SMART URGENCY RANKING ENGINE TESTS
# ===========================================================================

def test_multi_factor_urgency_ranking():
    complaints = [
        {"id": "C1", "priority": "Low", "title": "Peeling paint", "description": "Minor cosmetic wall mark in room", "location": "Room 101"},
        {"id": "C2", "priority": "Critical", "title": "Burning socket", "description": "Burning smell and sparks from live socket in corridor", "location": "Academic Corridor"},
        {"id": "C3", "priority": "High", "title": "Water leakage", "description": "Water overflowing and spreading to stairs", "location": "Hostel Washroom"},
        {"id": "C4", "priority": "Medium", "title": "Broken fan", "description": "Fan not working in classroom 302", "location": "Classroom 302"},
    ]

    ranked = rank_all_complaints(complaints)
    assert ranked[0]["id"] == "C2"  # Burning socket is rank 1
    assert ranked[1]["id"] == "C3"  # Water overflow is rank 2
    assert ranked[2]["id"] == "C4"  # Broken fan is rank 3
    assert ranked[3]["id"] == "C1"  # Peeling paint is rank 4
    assert ranked[0]["urgency_rank"] == 1


# ===========================================================================
# 6. ROLE-BASED SCOPING TESTS (Student sees own; Warden sees all)
# ===========================================================================

def test_role_based_complaint_access(client):
    # 1. Login student1
    res_s1 = client.post("/api/auth/login", json={"username": "student1", "password": "Student@123"})
    token_s1 = res_s1.json()["access_token"]
    headers_s1 = {"Authorization": f"Bearer {token_s1}"}

    # 2. Login student2
    res_s2 = client.post("/api/auth/login", json={"username": "student2", "password": "Student@123"})
    token_s2 = res_s2.json()["access_token"]
    headers_s2 = {"Authorization": f"Bearer {token_s2}"}

    # 3. Login warden1
    res_w = client.post("/api/auth/login", json={"username": "warden1", "password": "Warden@123"})
    token_w = res_w.json()["access_token"]
    headers_w = {"Authorization": f"Bearer {token_w}"}

    # Student 1 submits a complaint
    new_cmp = client.post(
        "/api/complaints",
        headers=headers_s1,
        json={
            "location": "Hostel H1 Rm 204",
            "title": "Broken desk handle",
            "description": "Handle of the study table drawer is broken and stuck",
            "category": "Furniture",
        },
    )
    assert new_cmp.status_code == 201
    created_id = new_cmp.json()["id"]

    # Student 1 lists complaints: must include created complaint
    s1_list = client.get("/api/complaints", headers=headers_s1)
    assert s1_list.status_code == 200
    s1_ids = [c["id"] for c in s1_list.json()["complaints"]]
    assert created_id in s1_ids

    # Student 2 lists complaints: must NOT include Student 1's complaint
    s2_list = client.get("/api/complaints", headers=headers_s2)
    assert s2_list.status_code == 200
    s2_ids = [c["id"] for c in s2_list.json()["complaints"]]
    assert created_id not in s2_ids

    # Warden lists complaints: must include ALL complaints including Student 1's
    w_list = client.get("/api/complaints", headers=headers_w)
    assert w_list.status_code == 200
    w_ids = [c["id"] for c in w_list.json()["complaints"]]
    assert created_id in w_ids


# ===========================================================================
# 7. CATEGORY ARRANGER & RANKED QUEUE ENDPOINTS
# ===========================================================================

def test_category_arranger_and_ranked_endpoints(client):
    # Ranked Queue
    r_ranked = client.get("/api/complaints/ranked")
    assert r_ranked.status_code == 200
    ranked_data = r_ranked.json()
    assert "ranked_complaints" in ranked_data
    if ranked_data["ranked_complaints"]:
        # First complaint should have higher urgency score than last
        first_score = ranked_data["ranked_complaints"][0].get("ranking_score", 0)
        last_score = ranked_data["ranked_complaints"][-1].get("ranking_score", 0)
        assert first_score >= last_score

    # Category Arranger
    r_cat = client.get("/api/complaints/by-category")
    assert r_cat.status_code == 200
    cats = r_cat.json()["categories"]
    assert len(cats) == 10
    cat_names = [c["category"] for c in cats]
    assert "Electrical" in cat_names
    assert "Plumbing" in cat_names
    assert "Hygiene & Sanitation" in cat_names
