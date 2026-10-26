"""
FixFirstAI - Campus Risk & Maintenance Analytics Engine
======================================================
Transforms reactive complaint data into proactive campus care intelligence:
  • Calculates Building Infrastructure Risk & Safety Health Scores (0-100)
  • Identifies Recurring Hazard Clusters & Infrastructure Failure Patterns
  • Generates Proactive Maintenance Advisories before hazards escalate
  • Tracks SLA Target Deadlines & Escalation Risk
"""

from datetime import datetime, timezone, timedelta
from typing import Any
import sqlite3

# SLA target durations in hours by priority
SLA_HOURS = {
    "Critical": 2,
    "High": 24,
    "Medium": 48,
    "Low": 168,  # 7 days
}

# Standard campus zones / buildings monitored
STANDARD_ZONES = [
    "Academic Block A",
    "Hostel Block B",
    "Science Building",
    "Lecture Hall Complex",
    "Central Library",
    "Canteen Area",
    "Computer Lab",
]

def calculate_sla_target(created_at_iso: str, priority: str) -> str:
    """Calculate the ISO deadline timestamp for a given ticket priority."""
    hours = SLA_HOURS.get(priority, 48)
    try:
        # Handle trailing Z or timezone offsets
        dt_str = created_at_iso.replace("Z", "+00:00")
        dt = datetime.fromisoformat(dt_str)
    except Exception:
        dt = datetime.now(timezone.utc)
    target = dt + timedelta(hours=hours)
    return target.isoformat()


def get_sla_status(created_at_iso: str, priority: str, status: str, resolved_at_iso: str | None = None) -> dict[str, Any]:
    """Calculate real-time SLA status, remaining time, and breach metrics."""
    hours = SLA_HOURS.get(priority, 48)
    try:
        dt_str = created_at_iso.replace("Z", "+00:00")
        created_dt = datetime.fromisoformat(dt_str)
    except Exception:
        created_dt = datetime.now(timezone.utc)
        
    deadline_dt = created_dt + timedelta(hours=hours)
    now = datetime.now(timezone.utc)
    
    if status in ("Resolved", "Resolved & Verified"):
        if resolved_at_iso:
            try:
                res_dt = datetime.fromisoformat(resolved_at_iso.replace("Z", "+00:00"))
            except Exception:
                res_dt = now
        else:
            res_dt = now
        met = res_dt <= deadline_dt
        return {
            "sla_hours": hours,
            "deadline": deadline_dt.isoformat(),
            "status": "Met SLA" if met else "Resolved Past SLA",
            "is_breached": not met,
            "remaining_display": "Completed",
            "urgency_class": "sla-met" if met else "sla-late"
        }

    # For active tickets
    remaining_secs = (deadline_dt - now).total_seconds()
    if remaining_secs < 0:
        overdue_hours = abs(int(remaining_secs // 3600))
        return {
            "sla_hours": hours,
            "deadline": deadline_dt.isoformat(),
            "status": "SLA Breached",
            "is_breached": True,
            "remaining_display": f"{overdue_hours}h overdue" if overdue_hours > 0 else "Breached",
            "urgency_class": "sla-breached"
        }
    
    rem_hours = int(remaining_secs // 3600)
    rem_mins = int((remaining_secs % 3600) // 60)
    fraction_left = remaining_secs / (hours * 3600)
    
    if fraction_left <= 0.25:
        sla_label = "Approaching Breach"
        urgency = "sla-warning"
    else:
        sla_label = "On Track"
        urgency = "sla-ontrack"

    return {
        "sla_hours": hours,
        "deadline": deadline_dt.isoformat(),
        "status": sla_label,
        "is_breached": False,
        "remaining_display": f"{rem_hours}h {rem_mins}m left" if rem_hours > 0 else f"{rem_mins}m left",
        "urgency_class": urgency
    }


def compute_campus_risk_intelligence(conn: sqlite3.Connection) -> dict[str, Any]:
    """
    Analyzes historical and current complaints/tickets across the campus to produce:
      1. Building Safety Scorecards (0-100)
      2. Hazard Clusters & Recurring Failure Patterns
      3. Proactive Preventative Maintenance Advisories
      4. Campus Risk Overview KPI
    """
    complaints = conn.execute("SELECT * FROM complaints").fetchall()
    tickets = conn.execute("SELECT * FROM tickets").fetchall()
    
    # Map complaints by location
    location_data: dict[str, list[dict[str, Any]]] = {}
    for z in STANDARD_ZONES:
        location_data[z] = []

    for c in complaints:
        cd = dict(c)
        loc = cd["location"]
        # Match standard zone or group
        matched_zone = None
        for z in STANDARD_ZONES:
            if z.lower() in loc.lower() or loc.lower() in z.lower():
                matched_zone = z
                break
        if not matched_zone:
            matched_zone = loc
        if matched_zone not in location_data:
            location_data[matched_zone] = []
        location_data[matched_zone].append(cd)

    # 1. Compute Building Scorecards
    building_scorecards = []
    total_safety_score = 0
    total_buildings = 0

    for loc, items in location_data.items():
        if not items and loc not in STANDARD_ZONES:
            continue
            
        unresolved = [i for i in items if i.get("status") != "Resolved"]
        critical_count = sum(1 for i in unresolved if i.get("priority") == "Critical")
        high_count = sum(1 for i in unresolved if i.get("priority") == "High")
        medium_count = sum(1 for i in unresolved if i.get("priority") == "Medium")
        low_count = sum(1 for i in unresolved if i.get("priority") == "Low")

        # Base score 100 with penalties for unresolved severity
        deductions = (critical_count * 25) + (high_count * 12) + (medium_count * 5) + (low_count * 2)
        # Extra penalty if multiple unresolved in same location (cluster effect)
        if len(unresolved) >= 3:
            deductions += 10
            
        score = max(10, min(100, 100 - deductions))
        
        if score >= 85:
            risk_tier = "Safe"
            badge_class = "badge-low"
            color = "#16a34a"
        elif score >= 65:
            risk_tier = "Elevated Risk"
            badge_class = "badge-medium"
            color = "#ea580c"
        else:
            risk_tier = "Hazard Hotspot"
            badge_class = "badge-critical"
            color = "#dc2626"

        building_scorecards.append({
            "location": loc,
            "safety_score": score,
            "risk_tier": risk_tier,
            "badge_class": badge_class,
            "color": color,
            "total_complaints": len(items),
            "unresolved_count": len(unresolved),
            "critical_count": critical_count,
            "high_count": high_count,
            "medium_count": medium_count,
            "primary_concern": _detect_primary_concern(items)
        })
        
        total_safety_score += score
        total_buildings += 1

    # Sort buildings by risk (lowest score first)
    building_scorecards.sort(key=lambda b: b["safety_score"])

    # 2. Detect Hazard Clusters & Recurring Patterns
    hazard_clusters = _detect_hazard_clusters(complaints)

    # 3. Formulate Preventative Maintenance Advisories
    preventive_advisories = _generate_preventive_advisories(building_scorecards, hazard_clusters, complaints)

    # 4. Overall Campus Health Index
    campus_health = int(round(total_safety_score / max(1, total_buildings)))
    active_critical = sum(1 for c in complaints if c["priority"] == "Critical" and c["status"] != "Resolved")
    active_high = sum(1 for c in complaints if c["priority"] == "High" and c["status"] != "Resolved")
    
    # SLA compliance tracking
    sla_met_count = 0
    total_tickets = len(tickets)
    for t in tickets:
        status_info = get_sla_status(t["created_at"], t["priority"], t["status"], t.get("updated_at") if t["status"] == "Resolved" else None)
        if not status_info["is_breached"]:
            sla_met_count += 1
            
    sla_compliance_rate = int(round((sla_met_count / max(1, total_tickets)) * 100)) if total_tickets > 0 else 100

    return {
        "campus_health_score": campus_health,
        "campus_health_tier": "Good Standing" if campus_health >= 80 else ("Watchlist" if campus_health >= 65 else "Immediate Intervention Required"),
        "active_critical_hazards": active_critical,
        "active_high_risks": active_high,
        "hazard_clusters_count": len(hazard_clusters),
        "sla_compliance_rate": sla_compliance_rate,
        "building_scorecards": building_scorecards,
        "hazard_clusters": hazard_clusters,
        "preventive_advisories": preventive_advisories,
        "last_updated": datetime.now(timezone.utc).isoformat()
    }


def _detect_primary_concern(complaint_list: list[dict[str, Any]]) -> str:
    if not complaint_list:
        return "Normal Operations"
    cat_counts: dict[str, int] = {}
    for c in complaint_list:
        cat = c.get("category", "General")
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    top_cat = max(cat_counts.items(), key=lambda x: x[1])[0]
    return f"Frequent {top_cat}"


def _detect_hazard_clusters(complaints: list[Any]) -> list[dict[str, Any]]:
    """Scan for 2+ incidents in the same category & location indicating systemic failure."""
    clusters = []
    loc_cat_map: dict[tuple[str, str], list[dict[str, Any]]] = {}

    for c in complaints:
        cd = dict(c)
        loc = cd["location"]
        cat = cd["category"]
        key = (loc, cat)
        loc_cat_map.setdefault(key, []).append(cd)

    for (loc, cat), items in loc_cat_map.items():
        if len(items) >= 2 or any(i.get("priority") == "Critical" for i in items):
            has_critical = any(i.get("priority") == "Critical" for i in items)
            
            # Formulate root cause & escalation risk
            if cat == "Electrical Safety":
                root_cause = "Conduit water ingress or overloaded substation riser lines in older branch circuits."
                escalation = "High danger of flashover, circuit breaker trips, or localized electrical fires."
                action = "Isolate branch circuits, measure insulation resistance (Megger test), and re-seal distribution boxes."
            elif cat == "Water Leakage":
                root_cause = "Degraded pipe joint seals or micro-fissures in overhead plumbing manifolds."
                escalation = "Mould growth, structural ceiling plaster detachment, and water seepage to adjacent electrical conduits."
                action = "Deploy pressure testing across the riser lines, apply hydro-isolation membranes, and inspect ceiling slabs."
            elif cat == "Emergency Exit":
                root_cause = "Improper temporary staging of furniture and lack of designated storage zones."
                escalation = "Critical egress obstruction violating campus fire safety protocols during emergencies."
                action = "Enforce zero-tolerance corridor clearance and establish dedicated scrap disposal protocols."
            elif cat == "Hygiene":
                root_cause = "Sub-optimal floor drainage slope and intermittent liquid spills during peak dining/class hours."
                escalation = "Repeated student slip-and-fall physical injuries and liability exposure."
                action = "Install commercial-grade non-slip floor treatments and deploy hourly rapid-mop protocols."
            else:
                root_cause = "Deferred preventive maintenance cycle and component fatigue."
                escalation = "Gradual degradation leading to service outages and student disruption."
                action = "Conduct full asset inspection and replace worn fittings."

            clusters.append({
                "cluster_id": f"CLUST-{len(clusters)+1:02d}",
                "location": loc,
                "category": cat,
                "incident_count": len(items),
                "severity": "Critical Hotspot" if has_critical else "Elevated Pattern",
                "severity_badge": "badge-critical" if has_critical else "badge-high",
                "sample_incident_ids": [i.get("id") for i in items[:3]],
                "root_cause_hypothesis": root_cause,
                "escalation_risk": escalation,
                "recommended_action": action
            })

    # Sort: Critical Hotspots first
    clusters.sort(key=lambda x: (x["severity"] != "Critical Hotspot", -x["incident_count"]))
    return clusters


def _generate_preventive_advisories(scorecards: list[dict], clusters: list[dict], complaints: list[Any]) -> list[dict[str, Any]]:
    """Synthesize high-impact proactive advisories for facility management."""
    advisories = [
        {
            "id": "ADV-01",
            "title": "Pre-Monsoon Electrical & Moisture Containment Protocol",
            "target_zones": "Academic Block A & Science Building",
            "category": "Electrical & Water Safety",
            "urgency": "Immediate Priority",
            "urgency_color": "#dc2626",
            "rationale": "Historical data reveals water ingress near electrical switchboards during rainy weather, elevating electrocution risks.",
            "preventive_checklist": [
                "Inspect outdoor and corridor conduit seals for cracks",
                "Verify functional Ground Fault Circuit Interrupters (GFCI) across labs",
                "Ensure all distribution box covers are IP65 water-sealed"
            ]
        },
        {
            "id": "ADV-02",
            "title": "Campus Fire Egress & Emergency Exit Clearance Audit",
            "target_zones": "Science Building & Ground Corridors",
            "category": "Emergency & Life Safety",
            "urgency": "High Priority",
            "urgency_color": "#ea580c",
            "rationale": "Chemical and lab buildings carry higher fire load; blocked fire doors represent immediate legal and life safety violations.",
            "preventive_checklist": [
                "Audit all fire doors for unobstructed 180-degree swing",
                "Test emergency exit push-bars and panic hardware",
                "Issue department warnings against using corridors for storage"
            ]
        },
        {
            "id": "ADV-03",
            "title": "High-Traffic Corridors Slip-Resistant Surface Treatment",
            "target_zones": "Canteen Entrance & Hostel Washroom Foyers",
            "category": "Hygiene & Slip Prevention",
            "urgency": "Medium Priority",
            "urgency_color": "#ca8a04",
            "rationale": "Repetitive slipping incidents during meal hours require engineering controls rather than just temporary caution cones.",
            "preventive_checklist": [
                "Install heavy-duty rubberized anti-slip runner mats",
                "Treat ceramic tiles with anti-skid chemical coating",
                "Schedule dedicated housekeeping stationing during peak meal rushes"
            ]
        },
        {
            "id": "ADV-04",
            "title": "Drinking Water Purification & RO Membrane Preventive Replacement",
            "target_zones": "Central Academic Lobby & Library",
            "category": "Facilities & Public Health",
            "urgency": "Scheduled Maintenance",
            "urgency_color": "#16a34a",
            "rationale": "Cooler outage reports correlate with expired filter cycles. Scheduled filter changes prevent clean drinking water shortages.",
            "preventive_checklist": [
                "Replace 5-micron pre-filters and carbon blocks campus-wide",
                "Conduct TDS and microbial purity testing for each cooler unit",
                "Apply tamper-evident inspection tags showing next replacement date"
            ]
        }
    ]
    return advisories
