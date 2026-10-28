import json
import logging
import os
from typing import Any

import httpx
from google import genai

from backend.config import OLLAMA_URL, OLLAMA_MODEL

logger = logging.getLogger("fixfirst.ai")

_AI_TIMEOUT = 60.0
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


def _get_gemini_client():
    """Create a Gemini client if an API key is configured."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


async def check_ollama_available() -> bool:
    """Return True if the Ollama server is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False


async def check_model_available(model_name: str | None = None) -> bool:
    """Check whether the configured Ollama model is available."""
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
    """Check whether Gemini is configured. This does not make a paid API call."""
    return bool(os.getenv("GEMINI_API_KEY"))


async def analyze_with_ai(
    title: str,
    description: str,
    category: str,
) -> dict[str, Any] | None:
    """
    Analyze a maintenance/safety complaint with Gemini.
    Return None if Gemini is not configured or the request fails,
    allowing the existing rule-based fallback to run.
    """
    client = _get_gemini_client()
    if client is None:
        logger.info("GEMINI_API_KEY is not configured; AI analysis unavailable.")
        return None

    prompt = f"""
You are a campus safety and maintenance AI analyst.
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

    try:
        # The SDK call is synchronous, so run it in a worker thread to avoid
        # blocking FastAPI's async event loop.
        import asyncio

        response = await asyncio.to_thread(
            client.models.generate_content,
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "temperature": 0.3,
                "response_mime_type": "application/json",
            },
        )

        raw = response.text or ""
        result = _parse_ai_response(raw)
        if result is None:
            logger.warning("Gemini returned an unparseable response.")
        return result

    except Exception as exc:
        # Do not log the API key or request headers.
        logger.error("Gemini analysis request failed: %s", exc)
        return None


def _parse_ai_response(raw: str) -> dict[str, Any] | None:
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
            data = json.loads(text[start:end + 1])
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
        "source": "gemini",
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
