from __future__ import annotations

from fastapi import APIRouter

from app.analytics.analytics import evaluate_run_analytics
from app.schemas.analytics import AnalyticsEvaluateRequest, AnalyticsEvaluateResponse

router = APIRouter(tags=["analytics"])


@router.post("/api/v1/analytics/evaluate", response_model=AnalyticsEvaluateResponse)
def evaluate_analytics(payload: AnalyticsEvaluateRequest) -> AnalyticsEvaluateResponse:
    return evaluate_run_analytics(payload)
