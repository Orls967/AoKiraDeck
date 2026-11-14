from app.routes.analytics import router as analytics_router
from app.routes.health import router as health_router
from app.routes.optimization import router as optimization_router
from app.routes.scenarios import router as scenarios_router

__all__ = [
    "analytics_router",
    "health_router",
    "optimization_router",
    "scenarios_router",
]
