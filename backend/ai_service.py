"""
FixFirstAI - AI Service (Ollama Integration)
==============================================
Communicates with a local Ollama instance to get an LLM-powered analysis of
maintenance / safety complaints.  Falls back gracefully when Ollama is
unreachable or the model isn't loaded.
"""

import json
import logging
from typing import Any

import httpx

from backend.config import OLLAMA_URL, OLLAMA_MODEL

logger = logging.getLogger("fixfirst.ai")

# Timeout for Ollama API calls (seconds)
_AI_TIMEOUT = 60.0


# ---------------------------------------------------------------------------
# Health checks
# ---------------------------------------------------------------------------

async def check_ollama_available() -> bool:
    """Return True if the Ollama server is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False


async def check_model_available(model_name: str | None = None) -> bool:
    """Return True if the specified model (default: configured model) is loaded in Ollama."""
    model_name = model_name or OLLAMA_MODEL
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            if resp.status_code != 200:
                return False
            data = resp.json()
            models = [m.get("name", "") for m in data.get("models", [])]
            # Ollama sometimes includes the ":latest" tag
            return any(
                model_name in m or m.startswith(model_name.split(":")[0])
                for m in models
            )
    except Exception:
        return False


# ---------------------------------------------------------------------------
# AI analysis
# ---------------------------------------------------------------------------

async def analyze_with_ai(
    title: str,
    description: str,
    category: str,
) -> dict[str, Any] | None:
    """
    Ask the Ollama LLM to analyse a complaint and return structured JSON.

    Returns a dict on success, or None if Ollama is unavailable / the
    response cannot be parsed.
    """
    prompt = (
        "You are a campus safety and maintenance AI analyst. "
        "Analyze the following complaint and respond with ONLY valid JSON "
        "(no markdown, no code fences, no explanation outside the JSON).\n\n"
        f"Title: {title}\n"
        f"Description: {description}\n"
        f"Category: {category}\n\n"
        "Respond with this exact JSON structure:\n"
        "{\n"
        '  "category": "<best-fit category>",\n'
        '  "summary": "<one-line summary>",\n'
        '  "risk_indicators": ["<risk 1>", "<risk 2>"],\n'
        '  "suggested_priority": "<Critical|High|Medium|Low>",\n'
        '  "explanation": "<why this priority>",\n'
        '  "recommended_department": "<department name>",\n'
        '  "suggested_action": "<what to do next>"\n'
        "}\n"
    )

    try:
        async with httpx.AsyncClient(timeout=_AI_TIMEOUT) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.3},
                },
            )

            if resp.status_code != 200:
                logger.warning("Ollama returned status %s", resp.status_code)
                return None

            raw = resp.json().get("response", "")
            return _parse_ai_response(raw)

    except httpx.TimeoutException:
        logger.warning("Ollama request timed out after %.0f s", _AI_TIMEOUT)
        return None
    except Exception as exc:
        logger.error("Ollama request failed: %s", exc)
        return None


def _parse_ai_response(raw: str) -> dict[str, Any] | None:
    """
    Try to extract valid JSON from the raw LLM response.
    LLMs sometimes wrap JSON in ```json ... ``` fences.
    """
    text = raw.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.splitlines()
        # Remove first and last fence lines
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Last-resort: try to find the first { ... } block
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                data = json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                logger.warning("Could not parse AI response as JSON")
                return None
        else:
            logger.warning("No JSON object found in AI response")
            return None

    # Validate expected keys (be lenient — fill in defaults)
    valid_priorities = {"Critical", "High", "Medium", "Low"}
    suggested = data.get("suggested_priority", "Medium")
    if suggested not in valid_priorities:
        data["suggested_priority"] = "Medium"

    return {
        "category": data.get("category", ""),
        "summary": data.get("summary", ""),
        "risk_indicators": data.get("risk_indicators", []),
        "suggested_priority": data.get("suggested_priority", "Medium"),
        "explanation": data.get("explanation", ""),
        "recommended_department": data.get("recommended_department", ""),
        "suggested_action": data.get("suggested_action", ""),
    }


# ---------------------------------------------------------------------------
# Fallback (when AI is unavailable)
# ---------------------------------------------------------------------------

def get_fallback_analysis(
    title: str,
    description: str,
    category: str,
    rule_result: dict[str, Any],
) -> dict[str, Any]:
    """
    Build a synthetic AI-style analysis dict from the rule-engine output.
    Used when Ollama is not reachable.
    """
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
