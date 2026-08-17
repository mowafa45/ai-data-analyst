"""
Chat Router — /api/chat
POST /         — single-turn chat (full response)
POST /stream   — streaming chat via SSE
"""
import json
from typing import List

import structlog
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from models.schemas import ChatMessage, ChatRequest, ChatResponse
from services.ai_service import chat_with_data, stream_chat_with_data

log = structlog.get_logger()
router = APIRouter()


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Send a natural language question about the uploaded dataset.
    Returns a full response with optional chart artifacts.
    """
    if not req.session_id or not req.message.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="session_id and message are required.",
        )

    log.info("Chat request", session_id=req.session_id, msg_len=len(req.message))

    try:
        response = await chat_with_data(
            session_id=req.session_id,
            user_message=req.message,
            history=req.history,
        )
        return response
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        log.error("Chat failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI analysis failed. Please try again.",
        )


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    """
    Streaming version — returns SSE events:
      event: delta  — text chunk
      event: done   — final metadata (artifacts, confidence, follow-ups)
      event: error  — error message
    """
    if not req.session_id or not req.message.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="session_id and message are required.",
        )

    log.info("Streaming chat request", session_id=req.session_id)

    async def event_stream():
        try:
            async for chunk in stream_chat_with_data(
                session_id=req.session_id,
                user_message=req.message,
                history=req.history,
            ):
                yield chunk
        except ValueError as e:
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
        except Exception as e:
            log.error("Stream failed", error=str(e))
            yield f"event: error\ndata: {json.dumps({'message': 'Analysis failed. Please try again.'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
