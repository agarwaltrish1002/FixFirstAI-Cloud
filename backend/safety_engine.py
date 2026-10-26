"""
FixFirstAI - Rule-Based Safety Priority Engine
================================================
A deterministic rules engine that scans complaint text for known safety
keywords and returns a priority rating.  This ensures that critical hazards
(exposed wiring, blocked fire exits, etc.) are NEVER under-prioritised,
even if the AI model suggests a lower severity.
"""

from typing import Any

# ---------------------------------------------------------------------------
# Safety rules – ordered from most to least severe.
# Each rule carries: keywords (any match triggers), category hint,
# priority, human-readable reason, responsible department, and action.
# ---------------------------------------------------------------------------
SAFETY_RULES: list[dict[str, Any]] = [
    # ── CRITICAL ──────────────────────────────────────────────────────────
    {
        "keywords": ["electric", "shock", "exposed wire", "live wire",
                      "short circuit", "sparking", "electrocution",
                      "exposed wiring", "electrical wire"],
        "category": "Electrical Safety",
        "priority": "Critical",
        "reason": "Exposed or faulty electrical components pose an immediate electrocution or fire risk.",
        "department": "Electrical & Maintenance",
        "action": "Immediately isolate the area, cut power to the affected circuit, and dispatch an electrician.",
    },
    {
        "keywords": ["blocked exit", "exit blocked", "emergency exit",
                      "fire exit blocked", "fire escape", "obstructed exit",
                      "blocked fire exit"],
        "category": "Emergency Exit",
        "priority": "Critical",
        "reason": "A blocked emergency exit can trap occupants during a fire or other emergency.",
        "department": "Safety & Compliance",
        "action": "Clear the obstruction immediately, inspect all emergency exits, and issue a compliance notice.",
    },
    {
        "keywords": ["fire", "smoke", "burning", "flame", "gas leak",
                      "gas smell"],
        "category": "Fire Safety",
        "priority": "Critical",
        "reason": "Fire or gas-related hazards require immediate evacuation and response.",
        "department": "Fire Safety & Emergency",
        "action": "Evacuate the area, alert the fire department, and cut gas/power supply if safe.",
    },
    # water + electrical combo → Critical
    {
        "keywords": ["water near electric", "water near wire",
                      "leak near switchboard", "flooding electric",
                      "water electrical"],
        "category": "Electrical Safety",
        "priority": "Critical",
        "reason": "Water in proximity to electrical installations creates extreme electrocution risk.",
        "department": "Electrical & Maintenance",
        "action": "Cut power immediately, contain the water source, and dispatch both plumber and electrician.",
    },
    # ── HIGH ──────────────────────────────────────────────────────────────
    {
        "keywords": ["water leak", "leakage", "flooding", "water damage",
                      "pipe burst", "pipe leak", "seepage", "waterlogging"],
        "category": "Water Leakage",
        "priority": "High",
        "reason": "Water leakage can cause structural damage, mould growth, and slipping hazards.",
        "department": "Plumbing & Maintenance",
        "action": "Locate and shut off the water source, deploy drying equipment, and repair the pipe.",
    },
    {
        "keywords": ["slippery", "wet floor", "slip", "fall hazard",
                      "oily floor", "slippery floor"],
        "category": "Hygiene",
        "priority": "High",
        "reason": "Slippery surfaces are a leading cause of injury on campus.",
        "department": "Housekeeping & Safety",
        "action": "Place wet-floor signs, clean/dry the area, and investigate the source of the spill.",
    },
    # ── MEDIUM ────────────────────────────────────────────────────────────
    {
        "keywords": ["broken fan", "ceiling fan", "broken window",
                      "broken door", "damaged furniture", "cracked wall",
                      "broken railing", "broken bench"],
        "category": "Infrastructure",
        "priority": "Medium",
        "reason": "Damaged infrastructure reduces safety and comfort but is not immediately life-threatening.",
        "department": "Civil & Maintenance",
        "action": "Schedule repair within 48 hours and cordon off if there is a fall or injury risk.",
    },
    {
        "keywords": ["unhygienic", "dirty", "garbage", "stink",
                      "pest", "cockroach", "rat", "rodent", "mould",
                      "mold", "foul smell"],
        "category": "Hygiene",
        "priority": "Medium",
        "reason": "Hygiene issues can lead to health problems and indicate systemic maintenance gaps.",
        "department": "Housekeeping",
        "action": "Deploy cleaning crew, sanitize the area, and set up a recurring inspection schedule.",
    },
    {
        "keywords": ["flickering light", "light not working", "dark corridor",
                      "broken light", "dim light", "no light",
                      "lighting issue", "bulb"],
        "category": "Lighting",
        "priority": "Medium",
        "reason": "Poor lighting increases the risk of trips, falls, and security incidents.",
        "department": "Electrical & Maintenance",
        "action": "Replace the faulty fixture within 24 hours and check the wiring circuit.",
    },
    {
        "keywords": ["drinking water", "water cooler", "water purifier",
                      "ro not working", "no drinking water", "water filter"],
        "category": "Drinking Water",
        "priority": "Medium",
        "reason": "Access to safe drinking water is essential; outages affect many students.",
        "department": "Facilities Management",
        "action": "Arrange temporary water supply and schedule repair/replacement of the unit.",
    },
    # ── LOW ───────────────────────────────────────────────────────────────
    {
        "keywords": ["broken chair", "minor crack", "paint peeling",
                      "loose screw", "squeaky", "wobbly desk",
                      "small dent", "chipped tile"],
        "category": "Infrastructure",
        "priority": "Low",
        "reason": "Minor cosmetic or furniture damage with negligible safety impact.",
        "department": "General Maintenance",
        "action": "Add to the routine maintenance queue and replace during the next scheduled cycle.",
    },
]

# Priority ranking (lower number = higher severity)
_PRIORITY_RANK = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_complaint(title: str, description: str, category: str) -> dict[str, Any]:
    """
    Scan the complaint text against all safety rules and return the
    highest-priority match.

    Returns a dict with keys:
        priority, reason, department, recommended_action,
        matched_rules (list of rule summaries), safety_warning (str | None)
    """
    text = f"{title} {description} {category}".lower()

    matched: list[dict[str, Any]] = []

    for rule in SAFETY_RULES:
        # Check if ANY keyword from this rule appears in the text
        for kw in rule["keywords"]:
            if kw.lower() in text:
                matched.append(rule)
                break  # one keyword match is enough per rule

    if not matched:
        # No rule matched → default to Medium with generic info
        return {
            "priority": "Medium",
            "reason": "No specific safety rule matched. Assigned default medium priority for manual review.",
            "department": "General Maintenance",
            "recommended_action": "Inspect and assess the issue on-site, then assign to the appropriate team.",
            "matched_rules": [],
            "safety_warning": None,
        }

    # Pick the highest-priority match
    best = min(matched, key=lambda r: _PRIORITY_RANK.get(r["priority"], 99))

    safety_warning = None
    if best["priority"] == "Critical":
        safety_warning = (
            "[CRITICAL SAFETY HAZARD] - This complaint describes a situation "
            "that could cause serious injury or death. Immediate action is required."
        )

    return {
        "priority": best["priority"],
        "reason": best["reason"],
        "department": best["department"],
        "recommended_action": best["action"],
        "matched_rules": [
            {"category": r["category"], "priority": r["priority"], "reason": r["reason"]}
            for r in matched
        ],
        "safety_warning": safety_warning,
    }


def override_priority(
    ai_priority: str,
    rule_priority: str,
    rule_reason: str,
) -> dict[str, Any]:
    """
    Compare the AI-suggested priority with the rule-engine priority.

    If the rule engine says Critical but the AI says something lower,
    we override to Critical with an explanation.  Otherwise, we keep
    whichever is more severe.

    Returns:
        final_priority, source, override_applied, explanation
    """
    ai_rank = _PRIORITY_RANK.get(ai_priority, 99)
    rule_rank = _PRIORITY_RANK.get(rule_priority, 99)

    if rule_priority == "Critical" and ai_rank > rule_rank:
        return {
            "final_priority": "Critical",
            "source": "rule-based",
            "override_applied": True,
            "explanation": (
                f"The AI suggested '{ai_priority}', but the safety rule engine "
                f"detected a Critical hazard: {rule_reason}. Priority overridden "
                f"to Critical for safety."
            ),
        }

    # Use whichever is more severe (lower rank number)
    if rule_rank <= ai_rank:
        return {
            "final_priority": rule_priority,
            "source": "rule-based",
            "override_applied": rule_rank < ai_rank,
            "explanation": (
                f"Rule-based priority '{rule_priority}' is equal to or higher than "
                f"AI-suggested '{ai_priority}'. Using rule-based assessment."
            ),
        }

    return {
        "final_priority": ai_priority,
        "source": "ai-suggested",
        "override_applied": False,
        "explanation": (
            f"AI-suggested priority '{ai_priority}' is higher than rule-based "
            f"'{rule_priority}'. Using AI suggestion."
        ),
    }
