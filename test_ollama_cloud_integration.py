import pytest
import os
import json
from unittest.mock import patch, AsyncMock, MagicMock

# Import components under test
from backend.config import (
    AI_PROVIDER,
    GEMINI_MODEL,
    OLLAMA_MODEL,
    OLLAMA_CLOUD_ENDPOINT,
)
from backend.ai_service import (
    analyze_with_ai,
    _parse_ai_response,
    get_fallback_analysis,
    get_ai_service_status,
)
from backend.safety_engine import analyze_complaint as rule_analyze, override_priority


# ---------------------------------------------------------------------------
# Test 1: JSON Parsing and Fallbacks
# ---------------------------------------------------------------------------

def test_parse_ai_response_valid():
    raw_json = json.dumps({
        "category": "Electrical Safety",
        "summary": "Exposed wire in corridor",
        "risk_indicators": ["Shock hazard", "Fire risk"],
        "suggested_priority": "Critical",
        "explanation": "Exposed high voltage wiring.",
        "recommended_department": "Electrical Maintenance",
        "suggested_action": "Cordon off corridor immediately."
    })
    result = _parse_ai_response(raw_json, source="test")
    assert result is not None
    assert result["category"] in ("Electrical", "Electrical Safety")
    assert "Critical" in result["suggested_priority"]
    assert result["source"] == "test"


def test_parse_ai_response_with_markdown_fences():
    raw_text = '```json\n{"category": "Plumbing", "summary": "Leak", "suggested_priority": "High"}\n```'
    result = _parse_ai_response(raw_text, source="markdown_test")
    assert result is not None
    assert result["category"] == "Plumbing"
    assert "High" in result["suggested_priority"]


def test_parse_ai_response_invalid_json():
    result = _parse_ai_response("Invalid text that contains no json", source="fail_test")
    assert result is None


# ---------------------------------------------------------------------------
# Test 2: Safety Rule Engine Override Authority
# ---------------------------------------------------------------------------

def test_safety_engine_overrides_low_ai_priority():
    # If rule engine detects Critical hazard, even if AI says Low, priority must be Critical
    title = "Exposed sparking wire in corridor"
    description = "Bare live wire touching water puddle, sparking actively."
    category = "Electrical Safety"

    rule_result = rule_analyze(title, description, category)
    assert "Critical" in rule_result["priority"]

    # Simulated low AI priority
    merged = override_priority(
        ai_priority="Low",
        rule_priority=rule_result["priority"],
        rule_reason=rule_result["reason"],
    )

    assert "Critical" in merged["final_priority"]
    assert merged["override_applied"] is True
    assert "overridden" in merged["explanation"].lower() and "critical" in merged["explanation"].lower()


# ---------------------------------------------------------------------------
# Test 3: Gemini Behavior when AI_PROVIDER=gemini
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gemini_provider_dispatch():
    with patch.dict(os.environ, {"AI_PROVIDER": "gemini", "GEMINI_API_KEY": "dummy_key"}):
        with patch("backend.ai_service._analyze_with_gemini", new_callable=AsyncMock) as mock_gemini:
            mock_gemini.return_value = {
                "category": "HVAC",
                "summary": "AC breakdown",
                "suggested_priority": "Medium",
                "source": "gemini:gemini-2.5-flash",
            }
            res = await analyze_with_ai("AC unit broken", "Library AC not functioning", "HVAC")
            assert res is not None
            assert res["category"] == "HVAC"
            assert res["source"].startswith("gemini")
            mock_gemini.assert_called_once()


# ---------------------------------------------------------------------------
# Test 4: Ollama Cloud Request Format & Bearer Authentication
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ollama_cloud_request_format_and_auth():
    sample_response_data = {
        "model": "gemma4:31b",
        "message": {
            "role": "assistant",
            "content": json.dumps({
                "category": "Electrical Safety",
                "summary": "Switchboard sparks",
                "risk_indicators": ["Electrocution"],
                "suggested_priority": "Critical",
                "explanation": "Active electrical short circuit.",
                "recommended_department": "Electrical Maintenance",
                "suggested_action": "Cut circuit breaker immediately."
            }),
        },
        "done": True,
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = sample_response_data

    with patch.dict(os.environ, {
        "AI_PROVIDER": "ollama_cloud",
        "OLLAMA_API_KEY": "test_ollama_bearer_token_123",
        "OLLAMA_MODEL": "gemma4:31b"
    }):
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp

            res = await analyze_with_ai("Switchboard sparking", "Sparks in Lab 3", "Electrical Safety")

            assert res is not None
            assert "Critical" in res["suggested_priority"]
            assert res["source"] == "ollama_cloud:gemma4:31b"

            # Verify URL, Bearer Auth Header, and message.content payload shape
            call_args = mock_post.call_args
            assert call_args[0][0] == "https://ollama.com/api/chat"
            headers = call_args[1]["headers"]
            assert headers["Authorization"] == "Bearer test_ollama_bearer_token_123"
            json_payload = call_args[1]["json"]
            assert json_payload["model"] == "gemma4:31b"
            assert json_payload["messages"][0]["role"] == "user"


# ---------------------------------------------------------------------------
# Test 5: Graceful Fallback when Ollama Cloud Fails
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ollama_cloud_failure_falls_back():
    with patch.dict(os.environ, {
        "AI_PROVIDER": "ollama_cloud",
        "OLLAMA_API_KEY": "test_token",
        "GEMINI_API_KEY": ""  # No Gemini key either
    }):
        with patch("httpx.AsyncClient.post", side_effect=Exception("Connection timeout")):
            res = await analyze_with_ai("Water leak", "Pipe burst in 2nd floor", "Water Leakage")
            # Must return None so rule-based fallback smoothly takes over without crashing
            assert res is None


# ---------------------------------------------------------------------------
# Test 6: AI Status Accuracy (Cloud vs Local)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ai_status_endpoint_cloud_mode():
    with patch.dict(os.environ, {
        "AI_PROVIDER": "ollama_cloud",
        "OLLAMA_API_KEY": "sample_secret",
        "OLLAMA_MODEL": "gemma4:31b"
    }):
        with patch("backend.ai_service.check_ollama_cloud_available", new_callable=AsyncMock) as mock_check:
            mock_check.return_value = True

            status = await get_ai_service_status()

            assert status["provider"] == "ollama_cloud"
            assert status["configured_model"] == "gemma4:31b"
            assert status["credentials_configured"] is True
            assert status["connectivity_verified"] is True
            assert status["ai_ready"] is True
            # Confirm API key is NEVER leaked in response
            assert "sample_secret" not in json.dumps(status)


# ---------------------------------------------------------------------------
# Test 7: Rule Engine Fallback Generator
# ---------------------------------------------------------------------------

def test_rule_engine_fallback_generator():
    rule_res = {
        "priority": "Critical",
        "reason": "Fire hazard detected.",
        "department": "Fire Safety",
        "recommended_action": "Evacuate area.",
        "matched_rules": [{"reason": "Fire hazard detected."}]
    }
    fallback = get_fallback_analysis("Fire smell", "Smoke in pantry", "Fire Safety", rule_res)
    assert fallback["source"] == "rule-engine-fallback"
    assert "Critical" in fallback["suggested_priority"]
    assert fallback["recommended_department"] == "Fire Safety"
