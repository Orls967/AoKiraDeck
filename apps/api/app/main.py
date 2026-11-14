from __future__ import annotations

import os
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.errors import (
    DomainError,
    domain_error_handler,
    error_json_response,
    http_exception_handler,
    unhandled_exception_handler,
    validation_error_handler,
)
from app.routes import (
    analytics_router,
    health_router,
    optimization_router,
    scenarios_router,
)

MAX_PAYLOAD_BYTES = 5 * 1024 * 1024

DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "https://orls967.github.io",
]


def _parse_cors_origins() -> list[str]:
    raw = os.getenv("AOKIRA_CORS_ORIGINS", "")
    if not raw.strip():
        return DEFAULT_ORIGINS
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app = FastAPI(
    title="AoKira Analytics & Optimization API",
    version="1.0.0",
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def enforce_max_payload_size(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_PAYLOAD_BYTES:
                return error_json_response(
                    code="VALIDATION_ERROR",
                    message=f"Request payload exceeds {MAX_PAYLOAD_BYTES} byte limit",
                    status_code=413,
                )
        except ValueError:
            pass
    if request.method in ("POST", "PUT", "PATCH"):
        body = await request.body()
        if len(body) > MAX_PAYLOAD_BYTES:
            return error_json_response(
                code="VALIDATION_ERROR",
                message=f"Request payload exceeds {MAX_PAYLOAD_BYTES} byte limit",
                status_code=413,
            )
    return await call_next(request)


app.add_exception_handler(DomainError, domain_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(health_router)
app.include_router(analytics_router)
app.include_router(scenarios_router)
app.include_router(optimization_router)
