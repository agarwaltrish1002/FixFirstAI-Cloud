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
)

logger = logging.getLogger("fixfirst.ai")

_AI_TIMEOUT = 60.0


# ---------------------------------------------------------------------------
# Provider Health & Availability Checks
# ---------------------------------------------------------------------------

def _get_gemini_client():
    """Create a Gemini client if an API key is configured."""
    if not GEMINI_API_KEY:
        return None
    return genai.Client(api_key=GEMINI_API_KEY)


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
    return bool(GEMINI_API_KEY)


async def check_ollama_cloud_available() -> bool:
    """
    Check whether Ollama Cloud is configured and reachable.
    Validates endpoint and API key presence without executing full model generation.
    """
    if not OLLAMA_API_KEY:
        return False
    try:
        headers = {"Authorization": f"Bearer {OLLAMA_API_KEY}"}
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Check models / ping endpoint
            resp = await client.get("https://ollama.com/api/tags", headers=headers)
            return resp.status_code == 200
    except Exception:
        return False


async def get_ai_service_status() -> dict[str, Any]:
    """
    Comprehensive status check for active and optional AI providers.
    Does not crash if cloud or local services are offline.
    """
    provider = os.getenv("AI_PROVIDER", "gemini").lower()

    # Legacy fields preserved for backward compatibility
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
        # Default fallback provider
        model_name = os.getenv("GEMINI_MODEL", GEMINI_MODEL)
        credentials_configured = bool(os.getenv("GEMINI_API_KEY", GEMINI_API_KEY))
        connectivity_verified = credentials_configured
        ai_ready = credentials_configured

    return {
        # Preserved backward-compatible fields
        "ollama_available": local_ollama_ok,
        "model_loaded": local_model_ok,
        "model_name": model_name,
        # Enhanced accurate status fields
        "provider": provider,
        "configured_model": model_name,
        "credentials_configured": credentials_configured,
        "connectivity_verified": connectivity_verified,
        "ai_ready": ai_ready,
    }


# ---------------------------------------------------------------------------
# AI Analysis Routines
# ---------------------------------------------------------------------------

_ANALYSIS_PROMPT_TEMPLATE = """You are a campus safety and maintenance AI analyst.
Analyze the complaint below and return ONLY a valid JSON object.
Do not include markdown fences or text outside the JSON.

Title: {title}
Description: {description}
Category: {category}

Use exactly these fields:
{{
  "category": "best-fit category",
  "summary": "one-line summary",
  "risk_indicators": ["risk 1", "risk 2"],
  "suggested_priority": "Critical|High|Medium|Low",
  "explanation": "why this priority was chosen",
  "recommended_department": "department name",
  "suggested_action": "recommended next step"
}}

Be careful with safety risks. Do not claim that an issue has been physically inspected.
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
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
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
            # Read response from message.content
            raw_content = ""
            if "message" in data and isinstance(data["message"], dict):
                raw_content = data["message"].get("content", "")
            elif "response" in data:
                raw_content = data["response"]

            result = _parse_ai_response(raw_content, source=f"ollama_cloud:{model}")
            return result

    except Exception as exc:
        logger.error("Ollama Cloud analysis request failed: %s", exc)
        return None


async def _analyze_with_gemini(
    title: str,
    description: str,
    category: str,
) -> dict[str, Any] | None:
    """Analyze a maintenance/safety complaint with Gemini."""
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
                "temperature": 0.3,
                "response_mime_type": "application/json",
            },
        )

        raw = response.text or ""
        result = _parse_ai_response(raw, source=f"gemini:{gemini_model}")
        if result is None:
            logger.warning("Gemini returned an unparseable response.")
        return result

    except Exception as exc:
        logger.error("Gemini analysis request failed: %s", exc)
        return None


async def analyze_with_ai(
    title: str,
    description: str,
    category: str,
) -> dict[str, Any] | None:
    """
    Main dispatch routine for AI analysis.
    Supports AI_PROVIDER='gemini' (default), 'ollama_cloud', or 'ollama_local'.
    Falls back gracefully if the configured provider fails.
    """
    provider = os.getenv("AI_PROVIDER", "gemini").lower()
    result = None

    if provider == "ollama_cloud":
        result = await _analyze_with_ollama_cloud(title, description, category)
        # Fallback to Gemini if Ollama Cloud fails and Gemini key exists
        if result is None and GEMINI_API_KEY:
            logger.info("Ollama Cloud unavailable or failed; falling back to Gemini.")
            result = await _analyze_with_gemini(title, description, category)

    elif provider == "gemini":
        result = await _analyze_with_gemini(title, description, category)

    elif provider == "ollama_local":
        # Local Ollama fallback logic
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
                        "options": {"temperature": 0.3},
                    },
                )
                if resp.status_code == 200:
                    raw = resp.json().get("response", "")
                    result = _parse_ai_response(raw, source=f"ollama_local:{OLLAMA_MODEL}")
        except Exception as exc:
            logger.error("Local Ollama analysis failed: %s", exc)

    else:
        # Default to Gemini
        result = await _analyze_with_gemini(title, description, category)

    return result


def _parse_ai_response(raw: str, source: str = "ai") -> dict[str, Any] | None:
    """Parse and validate the AI's JSON response."""
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

    valid_priorities = {"Critical", "High", "Medium", "Low"}
    suggested = data.get("suggested_priority", "Medium")
    if suggested not in valid_priorities:
        suggested = "Medium"

    risks = data.get("risk_indicators", [])
    if not isinstance(risks, list):
        risks = []

    return {
        "category": str(data.get("category", "")),
        "summary": str(data.get("summary", "")),
        "risk_indicators": risks,
        "suggested_priority": suggested,
        "explanation": str(data.get("explanation", "")),
        "recommended_department": str(data.get("recommended_department", "")),
        "suggested_action": str(data.get("suggested_action", "")),
        "source": source,
    }


def get_fallback_analysis(
    title: str,
    description: str,
    category: str,
    rule_result: dict[str, Any],
) -> dict[str, Any]:
    """Build an AI-style response from the existing rule engine."""
    return {
        "category": category,
        "summary": f"[Rule-based] {title}",
        "risk_indicators": [
            r["reason"] for r in rule_result.get("matched_rules", [])
        ] or ["No specific risk indicators identified by rules."],
        "suggested_priority": rule_result["priority"],
        "explanation": rule_result["reason"],
        "recommended_department": rule_result["department"],
        "suggested_action": rule_result["recommended_action"],
        "source": "rule-engine-fallback",
    }
