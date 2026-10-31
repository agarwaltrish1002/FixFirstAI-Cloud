"""
FixFirstAI - Complaint Content Validation & Ambiguity Engine
=============================================================
Pre-screens complaints before classification or AI processing.
Rejects non-maintenance/casual chit-chat/nonsense inputs (e.g. "hello",
"I want pizza", random keystrokes) and flags ambiguous text requesting more detail.
"""

import re
from typing import Any

# Keywords indicating non-maintenance or casual conversation
CASUAL_PHRASES = {
    "hello", "hi", "hey", "how are you", "how r u", "good morning", "good evening",
    "good night", "what's up", "whats up", "sup", "bye", "ok", "okay", "thanks", "thank you",
    "i want pizza", "order food", "hungry", "burger", "coffee", "tea", "coke",
    "today is monday", "today is tuesday", "today is wednesday", "today is thursday",
    "today is friday", "today is saturday", "today is sunday", "weather is nice",
    "movie", "cricket match", "joke", "tell me a story", "who are you",
    "testing", "test 123", "just testing", "sample complaint", "asdf", "qwerty",
}

# Core campus maintenance domain signals
MAINTENANCE_KEYWORDS = {
    # Electrical
    "wire", "spark", "shock", "electric", "switch", "socket", "light", "fan", "bulb",
    "mcb", "power", "blackout", "fuse", "short circuit", "voltage", "cable",
    # Plumbing & Water
    "leak", "water", "pipe", "tap", "drain", "clog", "sewage", "flush", "sink",
    "shower", "basin", "geyser", "tank", "overflow", "drip", "moisture",
    # Hygiene & Sanitation
    "washroom", "toilet", "bathroom", "dirty", "unhygienic", "smell", "odor", "stink",
    "garbage", "trash", "waste", "dustbin", "clean", "moss", "sanitation", "pest",
    "cockroach", "rat", "mosquito", "insect",
    # Civil & Infrastructure
    "wall", "crack", "floor", "tile", "ceiling", "door", "window", "roof", "plaster",
    "seepage", "stairs", "railing", "paint", "pothole", "pavement", "glass", "cement",
    # Furniture
    "chair", "desk", "table", "bench", "cupboard", "almirah", "bed", "mattress",
    "hinge", "handle", "drawer", "podium", "blackboard", "whiteboard",
    # Fire & Safety
    "fire", "smoke", "burning", "flame", "extinguisher", "alarm", "exit", "emergency",
    "hazard", "gas", "cylinder", "blocked exit",
    # Security
    "lock", "key", "cctv", "camera", "theft", "gate", "guard", "security", "trespass",
    "broken lock", "unauthorized",
    # IT & Networking
    "wifi", "internet", "lan", "router", "network", "ethernet", "projector", "lab pc",
    "monitor", "server", "printer", "display",
    # HVAC & Ventilation
    "ac", "air conditioner", "cooling", "heater", "vent", "ventilation", "exhaust",
    "chiller", "compressor", "duct",
}

# Ambiguous phrases that lack descriptive substance
AMBIGUOUS_PATTERNS = [
    r"^(it is|its|it's)?\s*(broken|damaged|not working|bad|problem|issue|faulty)\.?$",
    r"^(fix this|help me|look at this|check this|repair this)\.?$",
    r"^(something is wrong|something broken|bad issue)\.?$",
    r"^(please fix|needs repair)\.?$",
]


def validate_complaint_content(title: str, description: str) -> dict[str, Any]:
    """
    Validates whether the user's submission constitutes a legitimate
    campus maintenance or safety complaint.

    Returns:
        is_valid: bool (True only if text represents genuine maintenance issue)
        status: 'valid' | 'invalid' | 'ambiguous'
        message: Guidance text for the user
        rejection_reason: Optional internal reason
    """
    clean_title = (title or "").strip().lower()
    clean_desc = (description or "").strip().lower()
    combined = f"{clean_title} {clean_desc}".strip()

    # 1. Minimum meaningful length check
    if len(combined) < 10:
        return {
            "is_valid": False,
            "status": "invalid",
            "message": "Complaint description is too short. Please provide clear details about the maintenance or safety issue.",
            "rejection_reason": "text_too_short",
        }

    # 2. Check for random repetitive keystrokes (gibberish e.g. "aaaaaa", "asdfasdf")
    words = re.findall(r"\b[a-z]{3,}\b", combined)
    if not words:
        return {
            "is_valid": False,
            "status": "invalid",
            "message": "The complaint contains meaningless text. Please enter a valid campus maintenance or safety issue.",
            "rejection_reason": "gibberish_detected",
        }

    # 3. Check for exact casual / chit-chat phrases
    if clean_title in CASUAL_PHRASES or clean_desc in CASUAL_PHRASES or combined in CASUAL_PHRASES:
        return {
            "is_valid": False,
            "status": "invalid",
            "message": "This does not appear to be a campus maintenance complaint. Please report specific infrastructure, safety, or repair issues (e.g., electrical faults, water leaks, or broken furniture).",
            "rejection_reason": "casual_chitchat_detected",
        }

    # 3. Check for ambiguous / vague complaint submissions (e.g. "Broken", "It is broken", "Fix this")
    for pat in AMBIGUOUS_PATTERNS:
        if re.match(pat, clean_title) or re.match(pat, clean_desc):
            return {
                "is_valid": False,
                "is_ambiguous": True,
                "status": "ambiguous",
                "message": "Your complaint is too vague. Please specify WHAT is broken (e.g. 'Ceiling fan not rotating' or 'Bathroom tap leaking') and provide more details.",
                "clarification_prompt": "Please clarify which specific item, appliance, or room fixture needs repair.",
                "rejection_reason": "ambiguous_complaint",
            }

    # 4. Check if words are purely casual without any facility context
    has_casual = any(phrase in combined for phrase in CASUAL_PHRASES)
    has_maintenance = any(k in combined for k in MAINTENANCE_KEYWORDS)

    if has_casual and not has_maintenance and len(words) <= 5:
        return {
            "is_valid": False,
            "status": "invalid",
            "message": "Casual messages and general conversation cannot be submitted as maintenance tickets. Please describe an infrastructure or safety issue.",
            "rejection_reason": "casual_text_no_maintenance_context",
        }

    # 5. Domain relevance verification
    # If the text has neither maintenance keywords nor specific physical hazard indicators
    if not has_maintenance:
        # Check if length is moderate and lacks domain nouns
        if len(words) < 8:
            return {
                "is_valid": False,
                "status": "ambiguous",
                "message": "Please provide more details about the problem and equipment or facility involved so our maintenance team can assist.",
                "rejection_reason": "unclear_facility_scope",
            }

    return {
        "is_valid": True,
        "status": "valid",
        "message": "Complaint validated as a legitimate campus maintenance request.",
        "rejection_reason": None,
    }
