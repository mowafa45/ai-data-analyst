"""
Forecast Router — /api/forecast
POST /run  — run ML forecasting on the dataset
"""
import structlog
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from models.schemas import ForecastResponse
from services.forecast_service import run_forecast

log = structlog.get_logger()
router = APIRouter()


class ForecastRequest(BaseModel):
    session_id: str
    target_col: Optional[str] = None
    date_col: Optional[str] = None
    horizon_days: int = 180


@router.post("/run", response_model=ForecastResponse)
async def forecast(req: ForecastRequest):
    """
    Run ML forecasting using Prophet, XGBoost, Linear Regression,
    and Random Forest. Auto-selects the best model by MAPE.
    """
    try:
        return await run_forecast(
            session_id=req.session_id,
            target_col=req.target_col,
            date_col=req.date_col,
            horizon_days=req.horizon_days,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        log.error("Forecast failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forecasting failed: {str(e)}",
        )
