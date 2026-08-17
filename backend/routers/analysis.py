"""
Analysis Router — /api/analysis
GET  /dashboard/{session_id}  — auto-generate full dashboard
GET  /preview/{session_id}    — first N rows of the dataset
"""
import structlog
from fastapi import APIRouter, HTTPException, Query, status

from models.schemas import DashboardResponse
from services.data_service import load_dataframe, load_meta
from services.insight_service import generate_dashboard

log = structlog.get_logger()
router = APIRouter()


@router.get("/dashboard/{session_id}", response_model=DashboardResponse)
async def get_dashboard(session_id: str):
    """Return auto-generated KPIs, charts, insights, and recommendations."""
    try:
        return await generate_dashboard(session_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        log.error("Dashboard generation failed", error=str(e), session_id=session_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dashboard generation failed.",
        )


@router.get("/preview/{session_id}")
async def get_preview(
    session_id: str,
    rows: int = Query(default=50, le=500, ge=1),
    offset: int = Query(default=0, ge=0),
):
    """Return a paginated slice of the dataset as JSON."""
    df = await load_dataframe(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found or expired.")
    meta = await load_meta(session_id)

    import numpy as np
    slice_df = df.iloc[offset : offset + rows]
    records = slice_df.replace({np.nan: None}).to_dict(orient="records")

    return {
        "session_id": session_id,
        "total_rows": len(df),
        "offset": offset,
        "rows": len(records),
        "data": records,
        "columns": [{"name": c.name, "dtype": c.dtype} for c in (meta.columns if meta else [])],
    }
