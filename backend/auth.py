"""
FixFirstAI - Authentication & Role-Based Authorization Layer
=============================================================
Provides secure password hashing via PBKDF2-HMAC-SHA256 (NIST compliant),
cryptographically signed session tokens, and FastAPI authorization guards.
Zero external C-dependency issues on Windows.
"""

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any, Optional

from fastapi import Depends, HTTPException, Header, status

from backend.config import SECRET_KEY, TOKEN_EXPIRATION_MINUTES


# ---------------------------------------------------------------------------
# Cryptographic Password Hashing (PBKDF2-HMAC-SHA256)
# ---------------------------------------------------------------------------

def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """
    Hash a password using PBKDF2-HMAC-SHA256 with a 16-byte random salt
    and 100,000 iterations.
    """
    if not salt:
        salt = secrets.token_hex(16)
    hashed_bytes = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000,
    )
    hashed_str = hashed_bytes.hex()
    return hashed_str, salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    """Verify that a plaintext password matches the stored hash."""
    computed_hash, _ = hash_password(password, salt=salt)
    return hmac.compare_digest(computed_hash, stored_hash)


# ---------------------------------------------------------------------------
# Secure Signed Tokens
# ---------------------------------------------------------------------------

def create_access_token(user_id: str, username: str, role: str, full_name: str) -> str:
    """Generate an HMAC-SHA256 signed access token with expiry."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "full_name": full_name,
        "iat": now,
        "exp": now + (TOKEN_EXPIRATION_MINUTES * 60),
    }

    encoded_header = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    encoded_payload = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    signing_input = f"{encoded_header}.{encoded_payload}"

    signature = hmac.new(
        SECRET_KEY.encode(),
        signing_input.encode(),
        hashlib.sha256,
    ).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode().rstrip("=")

    return f"{signing_input}.{encoded_signature}"


def verify_access_token(token: str) -> Optional[dict[str, Any]]:
    """Verify signature and expiration of an access token."""
    try:
        parts = token.strip().split(".")
        if len(parts) != 3:
            return None

        encoded_header, encoded_payload, encoded_sig = parts
        signing_input = f"{encoded_header}.{encoded_payload}"

        # Re-compute signature
        expected_sig = hmac.new(
            SECRET_KEY.encode(),
            signing_input.encode(),
            hashlib.sha256,
        ).digest()
        actual_sig = base64.urlsafe_b64decode(encoded_sig + "=" * (-len(encoded_sig) % 4))

        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        payload_bytes = base64.urlsafe_b64decode(encoded_payload + "=" * (-len(encoded_payload) % 4))
        payload = json.loads(payload_bytes.decode())

        # Check expiration
        if int(time.time()) > payload.get("exp", 0):
            return None

        return payload
    except Exception:
        return None


# ---------------------------------------------------------------------------
# FastAPI Dependency Injections
# ---------------------------------------------------------------------------

def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[dict[str, Any]]:
    """Extract user payload from Authorization header if present, otherwise None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split("Bearer ", 1)[1].strip()
    return verify_access_token(token)


def get_current_user(authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    """Enforce authenticated user token."""
    user = get_current_user_optional(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to proceed.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(allowed_roles: list[str]):
    """Guard endpoint to only allow users with specific roles (e.g. teacher, warden)."""
    def role_checker(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        user_role = current_user.get("role", "").lower()
        allowed = [r.lower() for r in allowed_roles]
        if user_role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {', '.join(allowed_roles)}.",
            )
        return current_user
    return role_checker
