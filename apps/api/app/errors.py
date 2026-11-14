from __future__ import annotations

import uuid

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.schemas.common import ApiErrorBody, ApiErrorDetail, ApiErrorResponse


class DomainError(Exception):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int = 422,
        details: list[ApiErrorDetail] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or []


def error_json_response(
    *,
    code: str,
    message: str,
    status_code: int,
    details: list[ApiErrorDetail] | None = None,
) -> JSONResponse:
    req_id = f"req-{uuid.uuid4().hex[:12]}"
    payload = ApiErrorResponse(
        error=ApiErrorBody(
            code=code,
            message=message,
            request_id=req_id,
            details=details or [],
        )
    )
    return JSONResponse(status_code=status_code, content=payload.model_dump(by_alias=True))


async def domain_error_handler(_request: Request, exc: DomainError) -> JSONResponse:
    return error_json_response(
        code=exc.code,
        message=exc.message,
        status_code=exc.status_code,
        details=exc.details,
    )


async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    details = []
    for err in exc.errors():
        loc_parts = [str(part) for part in err.get("loc", []) if part != "body"]
        field_name = ".".join(loc_parts) if loc_parts else "body"
        details.append(ApiErrorDetail(field=field_name, issue=str(err.get("msg", "Invalid value"))))
    return error_json_response(
        code="VALIDATION_ERROR",
        message="Request validation failed",
        status_code=422,
        details=details,
    )


async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    code = "VALIDATION_ERROR" if exc.status_code in (400, 413, 422) else "INTERNAL_ERROR"
    return error_json_response(
        code=code,
        message=str(exc.detail),
        status_code=exc.status_code,
        details=[],
    )


async def unhandled_exception_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return error_json_response(
        code="INTERNAL_ERROR",
        message="Unexpected internal server error",
        status_code=500,
        details=[],
    )
