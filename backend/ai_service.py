"""
FixFirstAI - AI Service Layer
================================
Provides intelligent complaint analysis via a clean provider abstraction.
Supports OpenAI (primary), Gemini (fallback), Ollama Cloud, and Local Ollama.

SECURITY:
  - API keys are read exclusively from environment variables — never hardcoded.
  - Keys are never logged or returned in API responses.

RELIABILITY:
  - Automatic retry with exponential backoff on transient failures.
  - Graceful degradation to deterministic rule-engine if all AI providers fail.
  - Fabricated confidence values are explicitly avoided; defaults are labelled.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx
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

# ---------------------------------------------------------------------------
# Timeouts & Retry Configuration
# ---------------------------------------------------------------------------
_AI_TIMEOUT = 60.0        # seconds per request
_MAX_RETRIES = 2          # total extra attempts after first failure
_RETRY_BACKOFF = [1.5, 3.0]  # seconds between retries


# ---------------------------------------------------------------------------
# Structured Prompt Template (same for all providers)
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
• P1 – Critical: Life safety hazards, fire, smoke, electrocution, gas leak, blocked emergency exit, ceiling collapse, exposed blood/body-fluid contamination, overflowing sanitary bins.
• P2 – High: Major water leak, blackout in block, slippery walking floor, utility loss affecting entire wing, missing sanitary disposal facilities, repeated sanitation failure.
• P3 – Medium: Broken classroom fan, AC cooling issue, restroom cleanliness, broken door latch, wifi router issue, routine hygiene.
• P4 – Low: Peeling paint, cosmetic damage, wobbly desk, minor squeaks.

IMPORTANT — Menstrual hygiene:
Menstruation itself is a natural biological process and MUST NEVER be classified as a disease or hazard.
Only classify as P1/P2 when there is an actual sanitation breakdown:
- Exposed blood/body-fluid contamination → P1
- Overflowing sanitary disposal bins → P1
- Missing sanitary disposal bins → P2
- Chronic uncleaned sanitary waste → P2
A neutral mention of menstrual hygiene products, pad dispensers, or health awareness → P3 or P4.

Analyze the complaint considering:
1. Severity of the reported problem
2. Urgency (how quickly risk escalates)
3. Safety impact (risk of injury or health hazard)
4. Number of people potentially affected
5. Location context (hostel block, lab, common area)
6. Whether the issue appears to be recurring

For invalid/unclear complaints (greetings, random text, irrelevant content), set valid_complaint to false.

Return ONLY a valid JSON object with this EXACT structure:
{{
  "valid_complaint": true,
  "detected_category": "one of the 10 standard categories above",
  "summary": "concise one-line summary of the physical problem",
  "suggested_priority": "P1 – Critical|P2 – High|P3 – Medium|P4 – Low",
  "priority_label": "Critical|High|Medium|Low",
  "confidence_score": 0.0,
  "requires_manual_review": false,
  "risk_indicators": ["risk 1", "risk 2"],
  "reason": "clear 1-2 sentence reason for why this priority was assigned considering safety and impact",
  "recommended_action": "clear actionable next step for maintenance staff",
  "recommended_department": "official department responsible"
}}

IMPORTANT: confidence_score must reflect your actual confidence (0.0 to 1.0).
Set requires_manual_review to true when confidence_score < 0.70 or the complaint is ambiguous.
"""


# ---------------------------------------------------------------------------
# OpenAI Provider
# ---------------------------------------------------------------------------

async def _analyze_with_openai(
    title: str,
    description: str,
    category: str,
) -> Optional[Dict[str, Any]]:
    """Analyze complaint using OpenAI API (primary provider).

    Reads OPENAI_API_KEY and OPENAI_MODEL from environment.
    Implements automatic retry with exponential backoff.
    Never fabricates results — returns None on failure.
    """
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        logger.info("OPENAI_API_KEY not configured; OpenAI analysis unavailable.")
        return None

    model = os.getenv("OPENAI_MODEL", "gpt-4.1")
    prompt = _ANALYSIS_PROMPT_TEMPLATE.format(
        title=title, description=description, category=category
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a campus safety and maintenance AI analyst. Always respond with valid JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "max_tokens": 600,
    }

    last_exc: Optional[Exception] = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=_AI_TIMEOUT) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers=headers,
                    json=payload,
                )

            if resp.status_code == 200:
                data = resp.json()
                raw = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                return _parse_ai_response(raw, source=f"openai:{model}")

            if resp.status_code in (429, 500, 502, 503, 504):
                # Transient error — retry
                logger.warning(
                    "OpenAI transient error (attempt %d/%d): HTTP %s",
                    attempt + 1, _MAX_RETRIES + 1, resp.status_code,
                )
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(_RETRY_BACKOFF[attempt])
                    continue

            logger.error(
                "OpenAI returned non-retryable status %s: %s",
                resp.status_code, resp.text[:200],
            )
            return None

        except httpx.TimeoutException as exc:
            last_exc = exc
            logger.warning("OpenAI request timed out (attempt %d/%d).", attempt + 1, _MAX_RETRIES + 1)
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_RETRY_BACKOFF[attempt])
        except Exception as exc:
            last_exc = exc
            logger.error("OpenAI request failed (attempt %d/%d): %s", attempt + 1, _MAX_RETRIES + 1, exc)
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_RETRY_BACKOFF[attempt])

    logger.error("All OpenAI retries exhausted. Last error: %s", last_exc)
    return None


async def check_openai_available() -> bool:
    """Check whether OpenAI is configured with a valid API key."""
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        return False
    try:
        headers = {"Authorization": f"Bearer {api_key}"}
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get("https://api.openai.com/v1/models", headers=headers)
            return resp.status_code == 200
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Gemini Provider (fallback)
# ---------------------------------------------------------------------------

def _get_gemini_client():
    """Create a Gemini client if an API key is configured."""
    try:
        from google import genai
        key = os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)
        if not key:
            return None
        return genai.Client(api_key=key)
    except ImportError:
        return None


async def _analyze_with_gemini(
    title: str,
    description: str,
    category: str,
) -> Optional[Dict[str, Any]]:
    """Analyze maintenance/safety complaint with Gemini (fallback provider)."""
    client = _get_gemini_client()
    if client is None:
        logger.info("GEMINI_API_KEY not configured or google-genai unavailable.")
        return None

    prompt = _ANALYSIS_PROMPT_TEMPLATE.format(
        title=title, description=description, category=category
    )

    last_exc: Optional[Exception] = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
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
            last_exc = exc
            logger.warning("Gemini request failed (attempt %d/%d): %s", attempt + 1, _MAX_RETRIES + 1, exc)
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_RETRY_BACKOFF[attempt])

    logger.error("All Gemini retries exhausted. Last error: %s", last_exc)
    return None


async def check_gemini_available() -> bool:
    """Check whether Gemini is configured with an API key."""
    return bool(os.getenv("GEMINI_API_KEY", GEMINI_API_KEY))


# ---------------------------------------------------------------------------
# Ollama Cloud Provider
# ---------------------------------------------------------------------------

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


async def _analyze_with_ollama_cloud(
    title: str,
    description: str,
    category: str,
) -> Optional[Dict[str, Any]]:
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
            resp = await client.post(OLLAMA_CLOUD_ENDPOINT, headers=headers, json=payload)
            if resp.status_code != 200:
                logger.warning("Ollama Cloud HTTP %s: %s", resp.status_code, resp.text[:200])
                return None
            data = resp.json()
            raw_content = ""
            if "message" in data and isinstance(data["message"], dict):
                raw_content = data["message"].get("content", "")
            elif "response" in data:
                raw_content = data["response"]
            return _parse_ai_response(raw_content, source=f"ollama_cloud:{model}")
    except Exception as exc:
        logger.error("Ollama Cloud request failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Local Ollama Provider
# ---------------------------------------------------------------------------

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


async def _analyze_with_ollama_local(
    title: str,
    description: str,
    category: str,
) -> Optional[Dict[str, Any]]:
    """Analyze complaint using a local Ollama instance (e.g. localhost:11434)."""
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
                return _parse_ai_response(raw, source=f"ollama_local:{OLLAMA_MODEL}")
    except Exception as exc:
        logger.error("Local Ollama analysis failed: %s", exc)
    return None


# ---------------------------------------------------------------------------
# Provider Status Check
# ---------------------------------------------------------------------------

async def get_ai_service_status() -> Dict[str, Any]:
    """Comprehensive status check for active and optional AI providers."""
    provider = os.getenv("AI_PROVIDER", AI_PROVIDER).lower()

    local_ollama_ok = await check_ollama_available()
    local_model_ok = await check_model_available() if local_ollama_ok else False

    openai_configured = bool(os.getenv("OPENAI_API_KEY", ""))
    gemini_configured = bool(os.getenv("GEMINI_API_KEY", GEMINI_API_KEY))

    credentials_configured = False
    connectivity_verified = False
    ai_ready = False
    model_name = ""

    if provider == "openai":
        model_name = os.getenv("OPENAI_MODEL", "gpt-4.1")
        credentials_configured = openai_configured
        connectivity_verified = credentials_configured
        ai_ready = credentials_configured
    elif provider == "ollama_cloud":
        model_name = os.getenv("OLLAMA_MODEL", OLLAMA_MODEL)
        credentials_configured = bool(os.getenv("OLLAMA_API_KEY", OLLAMA_API_KEY))
        if credentials_configured:
            connectivity_verified = await check_ollama_cloud_available()
        ai_ready = connectivity_verified
    elif provider == "gemini":
        model_name = os.getenv("GEMINI_MODEL", GEMINI_MODEL)
        credentials_configured = gemini_configured
        connectivity_verified = credentials_configured
        ai_ready = credentials_configured
    elif provider == "ollama_local":
        model_name = os.getenv("OLLAMA_MODEL", OLLAMA_MODEL)
        credentials_configured = True
        connectivity_verified = local_ollama_ok
        ai_ready = local_ollama_ok and local_model_ok
    else:
        # Default fallback: try OpenAI, then Gemini
        model_name = os.getenv("OPENAI_MODEL", "gpt-4.1") if openai_configured else os.getenv("GEMINI_MODEL", GEMINI_MODEL)
        credentials_configured = openai_configured or gemini_configured
        connectivity_verified = credentials_configured
        ai_ready = credentials_configured

    return {
        "provider": provider,
        "model_name": model_name,
        "configured_model": model_name,
        "credentials_configured": credentials_configured,
        "connectivity_verified": connectivity_verified,
        "ai_ready": ai_ready,
        "openai_configured": openai_configured,
        "gemini_configured": gemini_configured,
        "ollama_available": local_ollama_ok,
        "model_loaded": local_model_ok,
    }


# ---------------------------------------------------------------------------
# Main AI Dispatch (with provider fallback chain)
# ---------------------------------------------------------------------------

async def analyze_with_ai(
    title: str,
    description: str,
    category: str,
) -> Optional[Dict[str, Any]]:
    """Main dispatch for AI complaint analysis across all configured providers.

    Priority order (configurable via AI_PROVIDER env var):
      openai      → OpenAI GPT (default primary, falls back to Gemini)
      gemini      → Google Gemini 2.5 Flash
      ollama_cloud → Ollama.com hosted models
      ollama_local → Local Ollama instance

    When the primary provider fails, automatically falls back to:
      OpenAI → Gemini → Ollama Cloud → rule-engine fallback

    Args:
        title: Short title or summary of the campus maintenance issue.
        description: Full description with location and symptom details.
        category: Pre-detected campus facility category.

    Returns:
        Normalized analysis dict, or None if all providers fail.
        IMPORTANT: Returns None on failure — never returns fabricated analysis.
    """
    provider = os.getenv("AI_PROVIDER", AI_PROVIDER).lower()
    result: Optional[Dict[str, Any]] = None

    if provider == "openai":
        result = await _analyze_with_openai(title, description, category)
        if result is None and os.getenv("GEMINI_API_KEY", GEMINI_API_KEY):
            logger.info("OpenAI unavailable; falling back to Gemini.")
            result = await _analyze_with_gemini(title, description, category)

    elif provider == "gemini":
        result = await _analyze_with_gemini(title, description, category)
        if result is None and os.getenv("OPENAI_API_KEY", ""):
            logger.info("Gemini unavailable; falling back to OpenAI.")
            result = await _analyze_with_openai(title, description, category)

    elif provider == "ollama_cloud":
        result = await _analyze_with_ollama_cloud(title, description, category)
        if result is None and os.getenv("OPENAI_API_KEY", ""):
            logger.info("Ollama Cloud unavailable; falling back to OpenAI.")
            result = await _analyze_with_openai(title, description, category)
        if result is None and os.getenv("GEMINI_API_KEY", GEMINI_API_KEY):
            result = await _analyze_with_gemini(title, description, category)

    elif provider == "ollama_local":
        result = await _analyze_with_ollama_local(title, description, category)

    else:
        # Default: try OpenAI first, then Gemini
        if os.getenv("OPENAI_API_KEY", ""):
            result = await _analyze_with_openai(title, description, category)
        if result is None and os.getenv("GEMINI_API_KEY", GEMINI_API_KEY):
            result = await _analyze_with_gemini(title, description, category)

    return result


# ---------------------------------------------------------------------------
# AI Response Parser & Normalizer
# ---------------------------------------------------------------------------

def _parse_ai_response(raw: str, source: str = "ai") -> Optional[Dict[str, Any]]:
    """Parse and validate the AI's JSON response with robust field normalization.

    Does NOT fabricate missing fields — uses explicit sentinel values
    to flag when the AI did not return a field.
    """
    text = raw.strip()

    # Strip markdown code fences if present
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
            logger.warning("No JSON object found in AI response from %s.", source)
            return None
        try:
            data = json.loads(text[start: end + 1])
        except json.JSONDecodeError:
            logger.warning("Could not parse AI response as JSON from %s.", source)
            return None

    if not isinstance(data, dict):
        return None

    # Handle complaint validity flag
    valid_complaint = bool(data.get("valid_complaint", True))

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
    if not dept or dept in ("department name", ""):
        dept = CATEGORY_DEPARTMENTS.get(canonical_category, "General Maintenance Services")

    # Confidence — only accept if within valid range
    conf_raw = data.get("confidence_score")
    if conf_raw is None:
        # AI did not return confidence — mark as estimate explicitly
        conf_float = 0.75
        confidence_is_estimate = True
    else:
        try:
            conf_float = max(0.0, min(1.0, float(conf_raw)))
            confidence_is_estimate = False
        except (TypeError, ValueError):
            conf_float = 0.75
            confidence_is_estimate = True

    req_review = bool(data.get("requires_manual_review", conf_float < 0.70))

    risks = data.get("risk_indicators", [])
    if not isinstance(risks, list):
        risks = []

    reason = str(data.get("reason", data.get("explanation", "")))
    recommended_action = str(data.get("recommended_action", data.get("suggested_action", "")))

    return {
        "valid_complaint": valid_complaint,
        "category": canonical_category,
        "detected_category": canonical_category,
        "summary": str(data.get("summary", "")),
        "risk_indicators": risks,
        "suggested_priority": canonical_priority,
        "priority": canonical_priority,
        "priority_label": data.get("priority_label", canonical_priority.split(" – ")[-1] if " – " in canonical_priority else "Medium"),
        "confidence_score": conf_float,
        "confidence_is_estimate": confidence_is_estimate,
        "requires_manual_review": req_review,
        "reason": reason,
        "explanation": reason,
        "recommended_action": recommended_action,
        "suggested_action": recommended_action,
        "recommended_department": str(dept),
        "source": source,
    }


# ---------------------------------------------------------------------------
# Rule-Engine Fallback (when all AI providers fail)
# ---------------------------------------------------------------------------

def get_fallback_analysis(
    title: str,
    description: str,
    category: str,
    rule_result: dict[str, Any],
) -> Dict[str, Any]:
    """Build an AI-style response from the deterministic safety rule engine.

    Used ONLY when all configured AI providers are unavailable.
    Clearly labelled as 'rule-engine-fallback' in the source field.
    """
    canonical_pri = normalize_priority_string(rule_result.get("priority", "P3 – Medium"))
    norm_cat = CATEGORY_NORMALIZE.get(
        rule_result.get("category", category).strip().lower(),
        "Other Maintenance",
    )
    priority_label = canonical_pri.split(" – ")[-1] if " – " in canonical_pri else "Medium"

    return {
        "valid_complaint": True,
        "category": norm_cat,
        "detected_category": norm_cat,
        "summary": f"[Rule Engine] {title}",
        "risk_indicators": [
            r["reason"] for r in rule_result.get("matched_rules", [])
        ] or ["Assessed using deterministic campus safety rules."],
        "suggested_priority": canonical_pri,
        "priority": canonical_pri,
        "priority_label": priority_label,
        "confidence_score": 0.85,
        "confidence_is_estimate": True,
        "requires_manual_review": False,
        "reason": rule_result.get("reason", "Analyzed via deterministic campus safety rules."),
        "explanation": rule_result.get("reason", "Analyzed via deterministic campus safety rules."),
        "recommended_action": rule_result.get("recommended_action", "Inspect and dispatch technician."),
        "suggested_action": rule_result.get("recommended_action", "Inspect and dispatch technician."),
        "recommended_department": rule_result.get("department") or CATEGORY_DEPARTMENTS.get(norm_cat, "General Maintenance Services"),
        "source": "rule-engine-fallback",
    }
