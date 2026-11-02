"""
FixFirstAI - Rule-Based Safety Priority Engine
================================================
A deterministic rules engine that scans complaint text for known safety
keywords and returns an authoritative priority rating. Critical hazards
(exposed wiring, blocked fire exits, gas leaks, blood/body-fluid contamination,
overflowing sanitary waste) are NEVER under-prioritised, even if an AI model
suggests a lower severity.

ETHICAL GUIDELINE:
Menstruation is a natural biological process and must NEVER be treated as a
disease or inherently hazardous. High priority is strictly tied to actual
sanitation breakdowns (exposed blood contamination, overflowing sanitary bins,
missing disposal bins), while protecting student privacy.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from backend.config import CATEGORY_DEPARTMENTS

# Standard 10 Category Normalization mapping
CATEGORY_NORMALIZE = {
    "electrical safety": "Electrical",
    "electrical": "Electrical",
    "water leakage": "Plumbing",
    "plumbing": "Plumbing",
    "emergency exit": "Fire Safety",
    "fire safety": "Fire Safety",
    "hygiene": "Hygiene & Sanitation",
    "hygiene & sanitation": "Hygiene & Sanitation",
    "sanitation": "Hygiene & Sanitation",
    "civil infrastructure": "Civil Infrastructure",
    "infrastructure": "Civil Infrastructure",
    "furniture": "Furniture",
    "security": "Security",
    "it & networking": "IT & Networking",
    "it": "IT & Networking",
    "hvac & ventilation": "HVAC & Ventilation",
    "hvac": "HVAC & Ventilation",
    "other": "Other Maintenance",
    "other maintenance": "Other Maintenance",
}

CATEGORY_KEYWORD_MAP = {
    "Electrical": ["spark", "wire", "electric", "socket", "switchboard", "shock", "mcb", "fuse", "power outage", "blackout", "bulb"],
    "Plumbing": ["leak", "pipe", "water", "tap", "drain", "sewage", "flush", "sink", "basin", "geyser", "overflow"],
    "Hygiene & Sanitation": ["unhygienic", "washroom", "toilet", "stink", "smell", "dirty", "dustbin", "garbage", "trash", "pest", "cockroach", "rat", "sanitary", "menstrual", "sanitary bin", "pad"],
    "Civil Infrastructure": ["crack", "ceiling", "plaster", "wall", "floor", "tile", "beam", "stairs", "railing", "roof", "pothole", "pavement", "glass window"],
    "Furniture": ["chair", "desk", "table", "bench", "cupboard", "almirah", "bed", "drawer", "podium"],
    "Fire Safety": ["fire", "smoke", "alarm", "extinguisher", "burning", "flame", "emergency exit", "gas leak"],
    "Security": ["lock", "cctv", "camera", "theft", "gate", "guard", "security", "latch", "trespass", "unauthorized"],
    "IT & Networking": ["wifi", "internet", "lan", "router", "network", "ethernet", "projector", "lab pc", "switch port"],
    "HVAC & Ventilation": ["ac", "air conditioner", "cooling", "vent", "ventilation", "exhaust", "chiller", "heater", "duct"],
}

# ---------------------------------------------------------------------------
# Safety rules – ordered from most to least severe.
# ---------------------------------------------------------------------------
SAFETY_RULES: List[Dict[str, Any]] = [
    # ── P1 CRITICAL: IMMEDIATE LIFE SAFETY & BIO-HAZARDS ────────────────────
    {
        "keywords": ["electric", "shock", "exposed wire", "live wire",
                     "short circuit", "sparking", "electrocution",
                     "exposed wiring", "electrical wire", "spark"],
        "category": "Electrical",
        "priority": "P1 – Critical",
        "reason": "Exposed or faulty electrical components pose an immediate electrocution or fire risk.",
        "department": "Electrical Maintenance",
        "action": "Immediately isolate the area, cut power to the affected circuit, and dispatch an emergency electrician.",
    },
    {
        "keywords": ["blocked exit", "exit blocked", "emergency exit",
                     "fire exit blocked", "fire escape", "obstructed exit",
                     "blocked fire exit"],
        "category": "Fire Safety",
        "priority": "P1 – Critical",
        "reason": "A blocked emergency exit can trap occupants during a fire or evacuation event.",
        "department": "Fire & Safety Response Cell",
        "action": "Clear obstruction immediately, inspect all emergency exits, and issue a compliance notice.",
    },
    {
        "keywords": ["fire", "smoke", "burning", "flame", "gas leak",
                     "gas smell", "burning smell"],
        "category": "Fire Safety",
        "priority": "P1 – Critical",
        "reason": "Fire, smoke, or gas leaks require immediate evacuation and emergency mitigation.",
        "department": "Fire & Safety Response Cell",
        "action": "Evacuate area immediately, alert campus security, and shut off gas/electrical mains.",
    },
    {
        "keywords": ["water near electric", "water near wire",
                     "leak near switchboard", "flooding electric",
                     "water electrical"],
        "category": "Electrical",
        "priority": "P1 – Critical",
        "reason": "Water in proximity to electrical installations creates extreme electrocution and arc flash risk.",
        "department": "Electrical Maintenance",
        "action": "Cut circuit breaker power immediately and dispatch plumbing and electrical teams.",
    },
    {
        "keywords": ["ceiling collapse", "structural crack", "slab falling", "beam crack"],
        "category": "Civil Infrastructure",
        "priority": "P1 – Critical",
        "reason": "Severe structural failure risk could cause falling debris or catastrophic collapse.",
        "department": "Estate & Civil Works",
        "action": "Cordon off danger perimeter immediately and request structural engineering assessment.",
    },

    # ── P1 CRITICAL: EXPOSED BLOOD & OVERFLOWING BIO-CONTAMINATION ───────────
    {
        "keywords": [
            "exposed menstrual blood", "menstrual blood on floor",
            "menstrual blood on toilet", "blood on toilet seat",
            "blood on washroom floor", "body fluid contamination",
            "blood on toilet surface", "blood on washroom surfaces",
            "exposed blood in washroom", "blood on toilet",
        ],
        "category": "Hygiene & Sanitation",
        "priority": "P1 – Critical",
        "reason": "Exposed blood or body-fluid contamination creates an acute biological health hazard requiring urgent professional chemical disinfection.",
        "department": "Housekeeping & Hygiene Operations",
        "action": "Immediately lock stall, dispatch authorized sanitation personnel with PPE and broad-spectrum bio-disinfectant, and verify completion.",
        "is_sensitive_hygiene": True,
    },
    {
        "keywords": [
            "overflowing sanitary bin", "overflowing sanitary waste bin",
            "overflowing sanitary bins", "sanitary bin overflowing",
            "sanitary bins overflowing", "overflowing menstrual waste",
            "overflowing pad bin", "sanitary waste overflow",
            "overflowing disposal bin",
        ],
        "category": "Hygiene & Sanitation",
        "priority": "P1 – Critical",
        "reason": "Overflowing sanitary disposal bins present severe biohazard exposure, pathogen proliferation, and washroom contamination.",
        "department": "Housekeeping & Hygiene Operations",
        "action": "Immediate dispatch of sanitation crew to clear, bag, incinerate/dispose safely, and chemically sterilize bin receptacles.",
        "is_sensitive_hygiene": True,
    },

    # ── P2 HIGH: SEVERE UTILITY & SANITATION INFRASTRUCTURE BREAKDOWNS ───────
    {
        "keywords": ["water leak", "leakage", "flooding", "water damage",
                     "pipe burst", "pipe leak", "seepage", "waterlogging", "major leak"],
        "category": "Plumbing",
        "priority": "P2 – High",
        "reason": "Active water leakage causes progressive structural damage, slipping hazards, and electrical contact risks.",
        "department": "Plumbing & Sanitation Department",
        "action": "Locate and shut off isolation valve, deploy extraction equipment, and replace faulty pipe segment.",
    },
    {
        "keywords": [
            "repeated failure to clean menstrual waste",
            "repeated sanitary waste management failure",
            "uncleaned sanitary bin for days",
            "sanitary waste not cleaned for days",
            "unhygienic girls washroom",
            "unhygienic girls' common washroom",
            "unhygienic girls' washroom",
            "girls washroom unhygienic",
        ],
        "category": "Hygiene & Sanitation",
        "priority": "P2 – High",
        "reason": "Chronic breakdown in sanitary waste clearance impacts resident health, dignity, and campus hygiene compliance.",
        "department": "Housekeeping & Hygiene Operations",
        "action": "Escalate directly to Hostel Warden, initiate complete washroom sanitation cycle within 4 hours, and audit housekeeping logs.",
        "is_sensitive_hygiene": True,
    },
    {
        "keywords": [
            "missing sanitary disposal bins",
            "missing sanitary bin",
            "missing sanitary bins",
            "no sanitary bin",
            "no sanitary bins",
            "missing disposal facilities",
            "missing disposal facility",
            "sanitary bin broken",
            "incinerator broken",
            "sanitary pad incinerator not working",
        ],
        "category": "Hygiene & Sanitation",
        "priority": "P2 – High",
        "reason": "Lack of sanitary disposal infrastructure forces improper disposal, causing severe plumbing blockages and environmental contamination.",
        "department": "Housekeeping & Hygiene Operations",
        "action": "Install heavy-duty lined sanitary bins immediately and verify incinerator/disposal access.",
        "is_sensitive_hygiene": True,
    },
    {
        "keywords": ["slippery", "wet floor", "slip", "fall hazard",
                     "oily floor", "slippery floor"],
        "category": "Hygiene & Sanitation",
        "priority": "P2 – High",
        "reason": "Slippery high-traffic walking surfaces pose an immediate physical slip-and-fall injury hazard.",
        "department": "Housekeeping & Hygiene Operations",
        "action": "Erect caution wet-floor barricades, mop dry immediately, and investigate fluid source.",
    },
    {
        "keywords": ["no water", "water outage", "blackout", "no power", "hostel dark"],
        "category": "Plumbing",
        "priority": "P2 – High",
        "reason": "Utility disruption in student residential blocks severely impacts campus health and safety.",
        "department": "Estate & Civil Works",
        "action": "Check main distribution supply, deploy backup pump/generator, and initiate repair.",
    },

    # ── P3 MEDIUM: GENERAL REPAIRS & ROUTINE HYGIENE ────────────────────────
    {
        "keywords": ["broken fan", "ceiling fan", "broken window",
                     "broken door", "damaged furniture", "broken railing",
                     "broken bench", "lock broken", "cctv down"],
        "category": "Civil Infrastructure",
        "priority": "P3 – Medium",
        "reason": "Damaged facility fixtures compromise comfort and security without immediate life hazard.",
        "department": "General Facilities & Carpentry",
        "action": "Schedule repair inspection within 24–48 hours.",
    },
    {
        "keywords": ["washroom cleaning", "general washroom cleaning", "clean the washroom",
                     "unhygienic", "dirty", "garbage", "stink",
                     "pest", "cockroach", "rat", "rodent", "mould",
                     "foul smell", "washroom dirty"],
        "category": "Hygiene & Sanitation",
        "priority": "P3 – Medium",
        "reason": "General sanitation issues impact facility cleanliness standards across campus buildings.",
        "department": "Housekeeping & Hygiene Operations",
        "action": "Dispatch sanitation crew for scheduled routine deep cleaning and chemical sanitization.",
    },
    {
        "keywords": ["ac not cooling", "ac broken", "air conditioner", "heating", "ventilation"],
        "category": "HVAC & Ventilation",
        "priority": "P3 – Medium",
        "reason": "HVAC malfunction causes student discomfort in lecture halls or library facilities.",
        "department": "HVAC & Climate Control Division",
        "action": "Inspect compressor, clean filters, and top up refrigerant if needed.",
    },
    {
        "keywords": ["wifi down", "internet not working", "lan cable", "projector broken"],
        "category": "IT & Networking",
        "priority": "P3 – Medium",
        "reason": "IT infrastructure failure disrupts academic activities and online coursework.",
        "department": "IT & Campus Network Center",
        "action": "Test router switch port and dispatch IT technician.",
    },

    # ── P4 LOW: COSMETIC & MINOR WEAR ───────────────────────────────────────
    {
        "keywords": ["broken chair", "minor crack", "paint peeling",
                     "loose screw", "squeaky", "wobbly desk", "peeling paint",
                     "small dent", "chipped tile", "cosmetic"],
        "category": "Civil Infrastructure",
        "priority": "P4 – Low",
        "reason": "Minor cosmetic defect or minor furniture wear with minimal safety impact.",
        "department": "General Maintenance Services",
        "action": "Log for scheduled routine cycle maintenance.",
    },
]

# Priority ranking (lower number = higher severity)
_PRIORITY_RANK = {
    "P1 – Critical": 0, "Critical": 0, "P1": 0,
    "P2 – High": 1, "High": 1, "P2": 1,
    "P3 – Medium": 2, "Medium": 2, "P3": 2,
    "P4 – Low": 3, "Low": 3, "P4": 3,
}

PRIORITY_NORMALIZED = {
    0: "P1 – Critical",
    1: "P2 – High",
    2: "P3 – Medium",
    3: "P4 – Low",
}


def normalize_priority_string(p: str) -> str:
    """Map any priority label to canonical format (e.g. 'P1 – Critical')."""
    rank = _PRIORITY_RANK.get(p, 2)
    return PRIORITY_NORMALIZED.get(rank, "P3 – Medium")


def detect_sensitive_hygiene(text: str) -> bool:
    """
    Check if complaint pertains to sensitive menstrual hygiene / sanitary disposal.
    Used to anonymize student names for maintenance workers.
    """
    sensitive_markers = [
        "menstrual", "sanitary bin", "sanitary pad", "period", "body fluid",
        "sanitary disposal", "disposal bin", "incinerator", "girls washroom",
        "girls' washroom", "common washroom", "blood on toilet"
    ]
    t = text.lower()
    return any(m in t for m in sensitive_markers)


def analyze_complaint(title: str, description: str, category: str = "Other Maintenance") -> Dict[str, Any]:
    """
    Scan complaint text against deterministic safety rules and return the highest-priority match.
    Enforces that menstruation is never pathologized as a disease, but actual biohazards
    (exposed blood, overflowing bins) are strictly escalated to P1/P2.
    """
    text = f"{title} {description} {category}".lower()
    is_sensitive = detect_sensitive_hygiene(text)

    # Contextual check: If menstruation is mentioned without contamination/defect,
    # e.g., "pad dispenser machine refill" or "menstrual health poster"
    # Ensure it is NOT falsely escalated to P1 biohazard.
    is_neutral_menstrual_mention = (
        ("menstruation" in text or "period" in text or "sanitary pad" in text) and
        not any(h in text for h in ["blood", "overflow", "stain", "soiled", "uncleaned", "missing", "broken", "dirty", "stink", "clog"])
    )

    matched: List[Dict[str, Any]] = []

    for rule in SAFETY_RULES:
        # If neutral menstrual mention, skip P1 blood/overflow rules
        if is_neutral_menstrual_mention and rule["priority"] == "P1 – Critical" and rule["category"] == "Hygiene & Sanitation":
            continue

        for kw in rule["keywords"]:
            if kw.lower() in text:
                matched.append(rule)
                break

    # Check for domain category auto-detection
    detected_cat = None
    for cat_name, kw_list in CATEGORY_KEYWORD_MAP.items():
        if any(k in text for k in kw_list):
            detected_cat = cat_name
            break

    if not matched:
        norm_cat = detected_cat or CATEGORY_NORMALIZE.get(category.lower(), "Other Maintenance")
        dept = CATEGORY_DEPARTMENTS.get(norm_cat, "General Maintenance Services")

        # Neutral menstrual mention gets standard amenity handling (P3/P4)
        if is_neutral_menstrual_mention:
            return {
                "priority": "P3 – Medium",
                "category": "Hygiene & Sanitation",
                "reason": "Menstrual health and wellness facility amenity request.",
                "department": "Housekeeping & Hygiene Operations",
                "recommended_action": "Check amenity stock and fulfill during routine servicing.",
                "matched_rules": [],
                "safety_warning": None,
                "is_sensitive_hygiene": True,
            }

        return {
            "priority": "P3 – Medium",
            "category": norm_cat,
            "reason": f"Standard maintenance request for {norm_cat} facility.",
            "department": dept,
            "recommended_action": "Inspect facility condition and address during standard service hours.",
            "matched_rules": [],
            "safety_warning": None,
            "is_sensitive_hygiene": is_sensitive,
        }

    # Pick highest-severity match (lowest rank integer)
    best = min(matched, key=lambda r: _PRIORITY_RANK.get(r["priority"], 99))
    canonical_pri = normalize_priority_string(best["priority"])

    safety_warning = None
    if _PRIORITY_RANK.get(canonical_pri, 99) == 0:
        if best.get("is_sensitive_hygiene"):
            safety_warning = (
                "[URGENT SANITATION ALERT] - Immediate biological and hygiene risk detected. "
                "Disinfection protocol required immediately."
            )
        else:
            safety_warning = (
                "[CRITICAL SAFETY HAZARD] - This complaint describes a situation "
                "that could cause serious injury or death. Immediate action is required."
            )

    # Use detected category if rule category is generic or if detected is more specific
    norm_category = CATEGORY_NORMALIZE.get(best["category"].lower(), best["category"])
    if norm_category in ("Other Maintenance", "Civil Infrastructure") and detected_cat:
        norm_category = detected_cat

    dept = CATEGORY_DEPARTMENTS.get(norm_category, best["department"])

    return {
        "priority": canonical_pri,
        "category": norm_category,
        "reason": best["reason"],
        "department": dept,
        "recommended_action": best["action"],
        "matched_rules": [
            {"category": r["category"], "priority": r["priority"], "reason": r["reason"]}
            for r in matched
        ],
        "safety_warning": safety_warning,
        "is_sensitive_hygiene": is_sensitive or bool(best.get("is_sensitive_hygiene")),
    }


def override_priority(
    ai_priority: str,
    rule_priority: str,
    rule_reason: str,
) -> Dict[str, Any]:
    """
    Compare AI-suggested priority with rule-engine priority.
    If the rule engine detects a P1 Critical safety hazard or acute sanitary risk, it strictly overrides AI.
    """
    canonical_ai = normalize_priority_string(ai_priority)
    canonical_rule = normalize_priority_string(rule_priority)

    ai_rank = _PRIORITY_RANK.get(canonical_ai, 2)
    rule_rank = _PRIORITY_RANK.get(canonical_rule, 2)

    # Critical Rule Override
    if rule_rank == 0 and ai_rank > 0:
        return {
            "final_priority": "P1 – Critical",
            "source": "rule-based-safety-override",
            "override_applied": True,
            "explanation": (
                f"The AI suggested '{canonical_ai}', but the safety rule engine "
                f"detected an urgent Critical hazard: {rule_reason}. Priority overridden "
                f"to P1 – Critical for campus safety."
            ),
        }

    # Use whichever is more severe (lower rank number)
    if rule_rank <= ai_rank:
        return {
            "final_priority": canonical_rule,
            "source": "rule-based",
            "override_applied": rule_rank < ai_rank,
            "explanation": (
                f"Safety rule priority '{canonical_rule}' is equal to or higher than "
                f"AI suggestion '{canonical_ai}'. Using safety rule assessment."
            ),
        }

    return {
        "final_priority": canonical_ai,
        "source": "ai-suggested",
        "override_applied": False,
        "explanation": (
            f"AI context priority '{canonical_ai}' evaluated from complaint details. "
            f"Standard priority applied."
        ),
    }
