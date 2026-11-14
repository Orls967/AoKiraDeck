from __future__ import annotations

from fastapi import APIRouter

from app.analytics.optimization import compare_scenarios
from app.schemas.optimization import ScenariosCompareRequest, ScenariosCompareResponse

router = APIRouter(tags=["scenarios"])


@router.post("/api/v1/scenarios/compare", response_model=ScenariosCompareResponse)
def scenarios_compare(payload: ScenariosCompareRequest) -> ScenariosCompareResponse:
    return compare_scenarios(payload)
