"""
FixFirstAI - Authentication & Role-Based Authorization Layer
=============================================================
Provides state-of-the-art password security via Argon2id (RFC 9106),
with backwards compatibility for legacy PBKDF2 hashes, cryptographically
signed session tokens, and strict FastAPI Role-Based Access Control guards.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import string
import time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import Depends, HTTPException, Header, status

from backend.config import SECRET_KEY, TOKEN_EXPIRATION_MINUTES, USER_ROLES

# ---------------------------------------------------------------------------
# Argon2id Hasher Initialization
# ---------------------------------------------------------------------------
try:
    from argon2 import PasswordHasher, Type
    from argon2.exceptions import InvalidHashError, VerifyMismatchError
    _argon2_hasher = PasswordHasher(
        time_cost=2,
        memory_cost=65536,
        parallelism=1,
        hash_len=32,
        type=Type.ID,
    )
except Exception:
    _argon2_hasher = None


# ---------------------------------------------------------------------------
# Cryptographic Password Hashing (Argon2id with PBKDF2 Fallback)
# ---------------------------------------------------------------------------

def hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """
    Hash a password using Argon2id.
    Returns (hashed_string, salt). If Argon2id is available, salt is embedded
    in the standard Argon2id PHC string, and a 16-byte hex salt is returned for DB compatibility.
    """
    salt_val = salt or secrets.token_hex(16)
    if _argon2_hasher is not None:
        hashed_str = _argon2_hasher.hash(password)
        return hashed_str, salt_val

    # Fallback to PBKDF2-HMAC-SHA256 if argon2 is unavailable in minimal environments
    hashed_bytes = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt_val.encode("utf-8"),
        100000,
    )
    return hashed_bytes.hex(), salt_val


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    """
    Verify that a plaintext password matches the stored hash.
    Supports both Argon2id hashes ($argon2id$...) and legacy PBKDF2 hashes.
    """
    if not stored_hash or not password:
        return False

    if stored_hash.startswith("$argon2"):
        if _argon2_hasher is None:
            return False
        try:
            return _argon2_hasher.verify(stored_hash, password)
        except (VerifyMismatchError, InvalidHashError):
            return False
        except Exception:
            return False

    # Check legacy PBKDF2-HMAC-SHA256
    try:
        computed_bytes = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            100000,
        )
        return hmac.compare_digest(computed_bytes.hex(), stored_hash)
    except Exception:
        return False


def generate_temporary_password(length: int = 12) -> str:
    """Generate a secure, high-entropy temporary password for candidate accounts."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    # Ensure at least one upper, one lower, one digit, one special
    chars = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%&*"),
    ]
    chars += [secrets.choice(alphabet) for _ in range(length - 4)]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


# ---------------------------------------------------------------------------
# Secure Signed Tokens
# ---------------------------------------------------------------------------

def create_access_token(
    user_id: str,
    username: str,
    role: str,
    full_name: str,
    department: str = "",
    assigned_area: str = "",
) -> str:
    """Generate an HMAC-SHA256 signed access token with role and profile metadata."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": user_id,
        "username": username,
        "role": role.lower(),
        "full_name": full_name,
        "department": department,
        "assigned_area": assigned_area,
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


def verify_access_token(token: str) -> Optional[Dict[str, Any]]:
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

def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    """Extract user payload from Authorization header if present, otherwise None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split("Bearer ", 1)[1].strip()
    return verify_access_token(token)


def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """Enforce authenticated user token."""
    user = get_current_user_optional(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to proceed.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(allowed_roles: List[str]):
    """Guard endpoint to only allow users with specific roles (e.g. admin, warden, worker, student)."""
    def role_checker(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_role = current_user.get("role", "").lower()
        allowed = [r.lower() for r in allowed_roles]
        # Treat 'teacher' as 'warden' for backwards compatibility
        effective_role = "warden" if user_role == "teacher" else user_role
        if effective_role not in allowed and user_role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {', '.join(allowed_roles)}.",
            )
        return current_user
    return role_checker
