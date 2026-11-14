from __future__ import annotations

from app.schemas.analytics import ForecastSummary


def compute_forecast(
    *,
    units_per_hour: float,
    target_rate_per_hour: float,
) -> ForecastSummary:
    projected_shift = units_per_hour * 8.0
    attainment = (
        (units_per_hour / target_rate_per_hour) * 100.0
        if target_rate_per_hour > 0.0
        else 0.0
    )
    return ForecastSummary(
        projected_units_per_hour=round(units_per_hour, 4),
        projected_units_per8h_shift=round(projected_shift, 2),
        target_attainment_pct=round(attainment, 2),
    )
