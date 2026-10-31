"""
FixFirstAI - Smart Complaint Ranking Engine
=============================================
Calculates multi-factor urgency scores to rank maintenance tasks
from most critical to least critical for Campus Wardens and Engineers.

Combines:
  • Priority weight (P1 Critical through P4 Low)
  • Safety hazard impact (fire, electrocution, gas, structural collapse)
  • Number of people affected / location scope
  • Risk of escalation or physical asset damage (water spreading, smoke)
  • Complaint age & SLA elapsed time
"""

from datetime import datetime, timezone
from typing import Any


PRIORITY_BASE_WEIGHTS = {
    "P1 – Critical": 100.0,
    "Critical": 100.0,
    "P2 – High": 65.0,
    "High": 65.0,
    "P3 – Medium": 35.0,
    "Medium": 35.0,
    "P4 – Low": 12.0,
    "Low": 12.0,
}

# Scope detection keywords
LARGE_SCOPE_KEYWORDS = [
    "corridor", "hall", "auditorium", "library", "mess", "canteen", "academic block",
    "entire floor", "entire block", "whole building", "hostel wing", "lecture hall",
    "staircase", "entrance", "quadrangle", "ground", "all students",
]

MEDIUM_SCOPE_KEYWORDS = [
    "classroom", "lab", "laboratory", "common washroom", "girls washroom", "boys washroom",
    "restroom", "reading room", "seminar room", "faculty room",
]

# Spreading / Escalation risk keywords
ESCALATION_KEYWORDS = [
    "spreading", "overflowing", "dripping fast", "flooding", "sparking", "crackling",
    "smoking", "burning smell", "expanding", "leaking continuously", "getting worse",
]


def calculate_complaint_ranking(complaint: dict[str, Any]) -> dict[str, Any]:
    """
    Computes a composite urgency score (0 - 200+) and explanation for a complaint.
    """
    priority = complaint.get("priority", "Medium")
    base_weight = PRIORITY_BASE_WEIGHTS.get(priority, 35.0)

    title = (complaint.get("title") or "").lower()
    desc = (complaint.get("description") or "").lower()
    location = (complaint.get("location") or "").lower()
    combined_text = f"{title} {desc} {location}"

    factors = []

    # 1. Safety Hazard Factor
    safety_hazard_points = 0.0
    if any(k in combined_text for k in ["exposed wire", "electric shock", "fire", "smoke", "burning", "gas leak", "collapse", "electrocution"]):
        safety_hazard_points = 45.0
        factors.append("Life-safety hazard detected (+45)")
    elif any(k in combined_text for k in ["spark", "leak", "slip", "injury", "broken glass", "falling"]):
        safety_hazard_points = 20.0
        factors.append("Physical injury or slip risk (+20)")

    # 2. Scope & Population Impact Factor
    scope_points = 5.0
    scope_label = "Single Room"
    if any(k in combined_text for k in LARGE_SCOPE_KEYWORDS):
        scope_points = 25.0
        scope_label = "High-Traffic Campus Zone"
        factors.append("Affects high-traffic campus area (+25)")
    elif any(k in combined_text for k in MEDIUM_SCOPE_KEYWORDS):
        scope_points = 15.0
        scope_label = "Shared Facility / Classroom"
        factors.append("Shared classroom or restroom facility (+15)")
    else:
        factors.append("Localized room scope (+5)")

    # 3. Escalation & Damage Risk Factor
    escalation_points = 0.0
    if any(k in combined_text for k in ESCALATION_KEYWORDS):
        escalation_points = 18.0
        factors.append("Active or spreading damage risk (+18)")

    # 4. Age Escalation Factor (capped at +25 so Low priority can never jump above Critical)
    age_points = 0.0
    created_at_str = complaint.get("created_at")
    age_hours = 0.0
    if created_at_str:
        try:
            created_dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            now_dt = datetime.now(timezone.utc)
            diff = now_dt - created_dt
            age_hours = max(0.0, diff.total_seconds() / 3600.0)
            age_points = min(25.0, age_hours * 0.8)
            if age_hours > 24:
                factors.append(f"Pending for {int(age_hours)}h (+{int(age_points)})")
        except Exception:
            pass

    # Status dampener: resolved or closed complaints get scored lower
    status = complaint.get("status", "Pending")
    status_multiplier = 0.2 if status == "Resolved" else 1.0

    total_score = round((base_weight + safety_hazard_points + scope_points + escalation_points + age_points) * status_multiplier, 1)

    ranking_reason = f"Priority [{priority}] + " + " • ".join(factors)

    return {
        "ranking_score": total_score,
        "ranking_reason": ranking_reason,
        "affected_scope": scope_label,
        "damage_risk": "High Escalation Risk" if escalation_points > 0 else "Contained",
    }


def rank_all_complaints(complaints_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Ranks a list of complaints in descending order of urgency score,
    assigning an ordinal rank (1, 2, 3...) to each.
    """
    scored = []
    for c in complaints_list:
        metrics = calculate_complaint_ranking(c)
        c_copy = dict(c)
        c_copy["ranking_score"] = metrics["ranking_score"]
        c_copy["ranking_reason"] = metrics["ranking_reason"]
        c_copy["affected_scope"] = metrics["affected_scope"]
        c_copy["damage_risk"] = metrics["damage_risk"]
        scored.append(c_copy)

    # Sort descending by score, tie-break by oldest created_at
    scored.sort(
        key=lambda item: (
            -item["ranking_score"],
            item.get("created_at", "")
        )
    )

    # Assign 1-based ranks
    for index, item in enumerate(scored, start=1):
        item["urgency_rank"] = index

    return scored
