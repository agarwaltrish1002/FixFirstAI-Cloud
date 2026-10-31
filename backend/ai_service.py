import json
import logging
import os
from typing import Any

import httpx
from google import genai

from backend.config import (
    AI_PROVIDER,
    GEMINI_MODEL,
    GEMINI_API_KEY,
    OLLAMA_API_KEY,
    OLLAMA_CLOUD_ENDPOINT,
    OLLAMA_URL,
    OLLAMA_MODEL,
    CATEGORIES,
    CATEGORY_DEPARTMENTS,
)
from backend.safety_engine import normalize_priority_string, CATEGORY_NORMALIZE

logger = logging.getLogger("fixfirst.ai")

_AI_TIMEOUT = 60.0


# ---------------------------------------------------------------------------
# Provider Health & Availability Checks
# ---------------------------------------------------------------------------

def _get_gemini_client():
    """Create a Gemini client if an API key is configured."""
    key = os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)
    if not key:
        return None
    return genai.Client(api_key=key)


async def check_ollama_available() -> bool:
    """Return True if the local Ollama server is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False


async def check_model_available(model_name: str | None = None) -> bool:
    """Check whether the configured local Ollama model is available."""
    model_name = model_name or OLLAMA_MODEL
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            if resp.status_code != 200:
                return False
            models = [m.get("name", "") for m in resp.json().get("models", [])]
            return any(
                model_name in m or m.startswith(model_name.split(":")[0])
                for m in models
            )
    except Exception:
        return False


async def check_gemini_available() -> bool:
    """Check whether Gemini is configured with an API key."""
    return bool(os.getenv("GEMINI_API_KEY", GEMINI_API_KEY))


async def check_ollama_cloud_available() -> bool:
    """Check whether Ollama Cloud is configured and reachable."""
    key = os.getenv("OLLAMA_API_KEY", OLLAMA_API_KEY)
    if not key:
        return False
    try:
        headers = {"Authorization": f"Bearer {key}"}
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get("https://ollama.com/api/tags", headers=headers)
            return resp.status_code == 200
    except Exception:
        return False


async def get_ai_service_status() -> dict[str, Any]:
    """Comprehensive status check for active and optional AI providers."""
    provider = os.getenv("AI_PROVIDER", "gemini").lower()

    local_ollama_ok = await check_ollama_available()
    local_model_ok = await check_model_available() if local_ollama_ok else False

    credentials_configured = False
    connectivity_verified = False
    ai_ready = False
    model_name = ""

    if provider == "ollama_cloud":
        model_name = os.getenv("OLLAMA_MODEL", OLLAMA_MODEL)
        credentials_configured = bool(os.getenv("OLLAMA_API_KEY", OLLAMA_API_KEY))
        if credentials_configured:
            connectivity_verified = await check_ollama_cloud_available()
            ai_ready = connectivity_verified
    elif provider == "gemini":
        model_name = os.getenv("GEMINI_MODEL", GEMINI_MODEL)
        credentials_configured = bool(os.getenv("GEMINI_API_KEY", GEMINI_API_KEY))
        connectivity_verified = credentials_configured
        ai_ready = credentials_configured
    elif provider == "ollama_local":
        model_name = os.getenv("OLLAMA_MODEL", OLLAMA_MODEL)
        credentials_configured = True
        connectivity_verified = local_ollama_ok
        ai_ready = local_ollama_ok and local_model_ok
    else:
        model_name = os.getenv("GEMINI_MODEL", GEMINI_MODEL)
        credentials_configured = bool(os.getenv("GEMINI_API_KEY", GEMINI_API_KEY))
        connectivity_verified = credentials_configured
        ai_ready = credentials_configured

    return {
        "ollama_available": local_ollama_ok,
        "model_loaded": local_model_ok,
        "model_name": model_name,
        "provider": provider,
        "configured_model": model_name,
        "credentials_configured": credentials_configured,
        "connectivity_verified": connectivity_verified,
        "ai_ready": ai_ready,
    }


# ---------------------------------------------------------------------------
# AI Prompt Template & Classification Logic
# ---------------------------------------------------------------------------

_ANALYSIS_PROMPT_TEMPLATE = """You are FixFirst AI — a Senior Campus Maintenance & Safety Risk Intelligence System.
Analyze the following maintenance complaint from students or faculty.

Complaint Title: {title}
Complaint Description: {description}
Selected Category (if any): {category}

Available Standard Categories:
1. Electrical
2. Plumbing
3. Hygiene & Sanitation
4. Civil Infrastructure
5. Furniture
6. Fire Safety
7. Security
8. IT & Networking
9. HVAC & Ventilation
10. Other Maintenance

Priority Levels:
• P1 – Critical: Life safety hazards, fire, smoke, electrocution, gas leak, blocked emergency exit, ceiling collapse.
• P2 – High: Major water leak, blackout in block, slippery walking floor, utility loss affecting entire wing.
• P3 – Medium: Broken classroom fan, AC cooling issue, restroom cleanliness, broken door latch, wifi router issue.
• P4 – Low: Peeling paint, cosmetic damage, wobbly desk, minor squeaks.

Return ONLY a valid JSON object with this exact structure:
{{
  "detected_category": "one of the 10 standard categories above",
  "summary": "concise one-line summary of the physical problem",
  "suggested_priority": "P1 – Critical|P2 – High|P3 – Medium|P4 – Low",
  "confidence_score": 0.95,
  "requires_manual_review": false,
  "risk_indicators": ["risk 1", "risk 2"],
  "explanation": "clear 1-2 sentence reason for why this priority was assigned considering safety and impact",
  "recommended_department": "official department responsible",
  "suggested_action": "clear actionable next step for maintenance staff"
}}
"""


async def _analyze_with_ollama_cloud(
    title: str,
    description: str,
    category: str,
) -> dict[str, Any] | None:
    """Analyze complaint using Ollama Cloud (https://ollama.com/api/chat)."""
    api_key = os.getenv("OLLAMA_API_KEY", OLLAMA_API_KEY)
    if not api_key:
        logger.warning("OLLAMA_API_KEY is not configured for Ollama Cloud.")
        return None

    model = os.getenv("OLLAMA_MODEL", OLLAMA_MODEL)
    prompt = _ANALYSIS_PROMPT_TEMPLATE.format(
        title=title, description=description, category=category
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "format": "json",
    }

    try:
        async with httpx.AsyncClient(timeout=_AI_TIMEOUT) as client:
            resp = await client.post(
                OLLAMA_CLOUD_ENDPOINT,
                headers=headers,
                json=payload,
            )

            if resp.status_code != 200:
                logger.warning("Ollama Cloud returned status %s: %s", resp.status_code, resp.text)
                return None

            data = resp.json()
            raw_content = ""
            if "message" in data and isinstance(data["message"], dict):
                raw_content = data["message"].get("content", "")
            elif "response" in data:
                raw_content = data["response"]

            return _parse_ai_response(raw_content, source=f"ollama_cloud:{model}")

    except Exception as exc:
        logger.error("Ollama Cloud analysis request failed: %s", exc)
        return None


async def _analyze_with_gemini(
    title: str,
    description: str,
    category: str,
) -> dict[str, Any] | None:
    """Analyze maintenance/safety complaint with Gemini 2.5 Flash."""
    client = _get_gemini_client()
    if client is None:
        logger.info("GEMINI_API_KEY is not configured; Gemini analysis unavailable.")
        return None

    prompt = _ANALYSIS_PROMPT_TEMPLATE.format(
        title=title, description=description, category=category
    )

    try:
        import asyncio

        gemini_model = os.getenv("GEMINI_MODEL", GEMINI_MODEL)
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=gemini_model,
            contents=prompt,
            config={
                "temperature": 0.2,
                "response_mime_type": "application/json",
            },
        )

        raw = response.text or ""
        return _parse_ai_response(raw, source=f"gemini:{gemini_model}")

    except Exception as exc:
        logger.error("Gemini analysis request failed: %s", exc)
        return None


async def analyze_with_ai(
    title: str,
    description: str,
    category: str,
) -> dict[str, Any] | None:
    """Main dispatch routine for AI analysis with multi-tier fallback."""
    provider = os.getenv("AI_PROVIDER", "gemini").lower()
    result = None

    if provider == "ollama_cloud":
        result = await _analyze_with_ollama_cloud(title, description, category)
        if result is None and os.getenv("GEMINI_API_KEY", GEMINI_API_KEY):
            logger.info("Ollama Cloud unavailable or failed; falling back to Gemini.")
            result = await _analyze_with_gemini(title, description, category)

    elif provider == "gemini":
        result = await _analyze_with_gemini(title, description, category)

    elif provider == "ollama_local":
        try:
            async with httpx.AsyncClient(timeout=_AI_TIMEOUT) as client:
                prompt = _ANALYSIS_PROMPT_TEMPLATE.format(
                    title=title, description=description, category=category
                )
                resp = await client.post(
                    f"{OLLAMA_URL}/api/generate",
                    json={
                        "model": OLLAMA_MODEL,
                        "prompt": prompt,
                        "stream": False,
                        "options": {"temperature": 0.2},
                    },
                )
                if resp.status_code == 200:
                    raw = resp.json().get("response", "")
                    result = _parse_ai_response(raw, source=f"ollama_local:{OLLAMA_MODEL}")
        except Exception as exc:
            logger.error("Local Ollama analysis failed: %s", exc)

    else:
        result = await _analyze_with_gemini(title, description, category)

    return result


def _parse_ai_response(raw: str, source: str = "ai") -> dict[str, Any] | None:
    """Parse and validate the AI's JSON response with robust defaults."""
    text = raw.strip()

    if text.startswith("```"):
        lines = text.splitlines()
        lines = [line for line in lines if not line.strip().startswith("```")]
        text = "\n".join(lines).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end <= start:
            logger.warning("No JSON object found in AI response.")
            return None
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            logger.warning("Could not parse AI response as JSON.")
            return None

    if not isinstance(data, dict):
        return None

    # Priority normalization
    raw_priority = data.get("suggested_priority", "P3 – Medium")
    canonical_priority = normalize_priority_string(raw_priority)

    # Category normalization to 10 standard categories
    raw_cat = data.get("detected_category") or data.get("category", "")
    canonical_category = CATEGORY_NORMALIZE.get(str(raw_cat).strip().lower())
    if not canonical_category or canonical_category not in CATEGORIES:
        canonical_category = "Other Maintenance"

    # Department assignment
    dept = data.get("recommended_department")
    if not dept or dept == "department name":
        dept = CATEGORY_DEPARTMENTS.get(canonical_category, "General Maintenance Services")

    # Confidence and review requirement
    conf = data.get("confidence_score")
    try:
        conf_float = float(conf)
    except (TypeError, ValueError):
        conf_float = 0.90

    req_review = bool(data.get("requires_manual_review", conf_float < 0.70))

    risks = data.get("risk_indicators", [])
    if not isinstance(risks, list):
        risks = []

    return {
        "category": canonical_category,
        "detected_category": canonical_category,
        "summary": str(data.get("summary", "")),
        "risk_indicators": risks,
        "suggested_priority": canonical_priority,
        "priority": canonical_priority,
        "confidence_score": conf_float,
        "requires_manual_review": req_review,
        "explanation": str(data.get("explanation", "")),
        "recommended_department": str(dept),
        "suggested_action": str(data.get("suggested_action", "")),
        "source": source,
    }


def get_fallback_analysis(
    title: str,
    description: str,
    category: str,
    rule_result: dict[str, Any],
) -> dict[str, Any]:
    """Build an AI-style response from the deterministic safety rule engine."""
    canonical_pri = normalize_priority_string(rule_result.get("priority", "P3 – Medium"))
    norm_cat = CATEGORY_NORMALIZE.get(
        rule_result.get("category", category).strip().lower(),
        "Other Maintenance",
    )

    return {
        "category": norm_cat,
        "detected_category": norm_cat,
        "summary": f"[Rule Engine] {title}",
        "risk_indicators": [
            r["reason"] for r in rule_result.get("matched_rules", [])
        ] or ["Assessed using campus facility safety rules."],
        "suggested_priority": canonical_pri,
        "priority": canonical_pri,
        "confidence_score": 0.88,
        "requires_manual_review": False,
        "explanation": rule_result.get("reason", "Analyzed via deterministic campus safety rules."),
        "recommended_department": rule_result.get("department") or CATEGORY_DEPARTMENTS.get(norm_cat, "General Maintenance Services"),
        "suggested_action": rule_result.get("recommended_action", "Inspect and dispatch technician."),
        "source": "rule-engine-fallback",
    }
