from __future__ import annotations

from fastapi import APIRouter

from app.analytics.optimization import run_constrained_optimization
from app.schemas.optimization import OptimizationRunRequest, OptimizationRunResponse

router = APIRouter(tags=["optimization"])


@router.post("/api/v1/optimization/run", response_model=OptimizationRunResponse)
def optimization_run(payload: OptimizationRunRequest) -> OptimizationRunResponse:
    return run_constrained_optimization(payload)
