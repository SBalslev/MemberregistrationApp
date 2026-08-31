from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass

HASH_NAME = "sha256"
HASH_ITERATIONS = 310_000
SESSION_LIFETIME_SECONDS = 3600


def hash_pin(pin: str, salt: bytes | None = None) -> str:
    if len(pin) < 4:
        raise ValueError("Trainer PIN must contain at least four characters")
    actual_salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        HASH_NAME,
        pin.encode("utf-8"),
        actual_salt,
        HASH_ITERATIONS,
    )
    return f"pbkdf2_{HASH_NAME}${HASH_ITERATIONS}${actual_salt.hex()}${digest.hex()}"


def verify_pin(pin: str, encoded_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_hex, expected_hex = encoded_hash.split("$", 3)
        if algorithm != f"pbkdf2_{HASH_NAME}":
            return False
        iterations = int(iterations_text)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(expected_hex)
    except (ValueError, TypeError):
        return False
    if iterations < 100_000 or len(salt) < 16:
        return False
    actual = hashlib.pbkdf2_hmac(HASH_NAME, pin.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


@dataclass(frozen=True)
class TrainerSession:
    token: str
    csrf_token: str
    expires_at: int


class TrainerSessionStore:
    def __init__(self, lifetime_seconds: int = SESSION_LIFETIME_SECONDS) -> None:
        self._lifetime_seconds = lifetime_seconds
        self._sessions: dict[str, TrainerSession] = {}

    def create(self, now: int | None = None) -> TrainerSession:
        current_time = now if now is not None else int(time.time())
        session = TrainerSession(
            token=secrets.token_urlsafe(32),
            csrf_token=secrets.token_urlsafe(32),
            expires_at=current_time + self._lifetime_seconds,
        )
        self._sessions[session.token] = session
        self._remove_expired(current_time)
        return session

    def get(self, token: str | None, now: int | None = None) -> TrainerSession | None:
        if not token:
            return None
        current_time = now if now is not None else int(time.time())
        self._remove_expired(current_time)
        return self._sessions.get(token)

    def delete(self, token: str | None) -> None:
        if token:
            self._sessions.pop(token, None)

    def _remove_expired(self, now: int) -> None:
        expired = [token for token, session in self._sessions.items() if session.expires_at <= now]
        for token in expired:
            del self._sessions[token]