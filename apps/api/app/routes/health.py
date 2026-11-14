from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/api/v1/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "aokira-api",
        "apiVersion": "1.0.0",
        "engineContractVersion": "1.0.0",
        "timestampUtc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
