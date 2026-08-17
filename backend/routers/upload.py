"""
Upload Router — /api/upload
POST /         — upload a CSV/XLSX file and start a session
DELETE /{id}   — end a session and purge cached data
"""
from pathlib import Path

import structlog
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from models.schemas import UploadResponse
from services.data_service import delete_session, parse_and_cache_file
from utils.config import settings

log = structlog.get_logger()
router = APIRouter()


@router.post("", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """
    Accept a CSV/XLSX/XLS file, parse it, clean it, cache it in Redis,
    and return the session ID with metadata and a row preview.
    """
    # ── Validate extension ─────────────────────────────────────────────────
    ext = Path(file.filename or "").suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}",
        )

    # ── Validate size ──────────────────────────────────────────────────────
    file_bytes = await file.read()
    size = len(file_bytes)
    if size > settings.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {settings.MAX_FILE_SIZE_MB} MB limit ({size/1e6:.1f} MB received).",
        )
    if size == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )

    log.info("File upload received", filename=file.filename, size_mb=round(size/1e6, 2))

    try:
        session_id, meta, preview = await parse_and_cache_file(
            file_bytes=file_bytes,
            filename=file.filename or "upload.csv",
            file_size=size,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        log.error("File parsing failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to parse file. Please check the format and try again.",
        )

    return UploadResponse(
        session_id=session_id,
        meta=meta,
        preview=preview,
        message=f"Parsed {meta.row_count:,} rows and {meta.col_count} columns. "
                f"Removed {meta.duplicates_removed} duplicates, handled {meta.missing_handled} missing values.",
    )


@router.delete("/{session_id}")
async def end_session(session_id: str):
    """Delete all cached data for a session (GDPR / privacy cleanup)."""
    await delete_session(session_id)
    return JSONResponse({"message": "Session data deleted.", "session_id": session_id})
