from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Conversation, Message, MessageRole
from app.db.session import AsyncSessionLocal, get_db
from app.generation.llm_service import LLMService
from app.retrieval.hybrid_retriever import HybridCodeRetriever

router = APIRouter(prefix="/repositories", tags=["Chat"])

llm_service = LLMService()
retriever = HybridCodeRetriever()


class ChatStreamRequest(BaseModel):
    query: str
    conversation_id: Optional[uuid.UUID] = None


class MessageResponse(BaseModel):
    id: uuid.UUID
    role: str
    content_markdown: str
    verified_citations: List[Dict[str, Any]]
    is_abstained: bool
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class ConversationResponse(BaseModel):
    id: uuid.UUID
    title: str
    created_at: str
    messages_count: int


@router.get("/{repo_id}/conversations", response_model=List[ConversationResponse])
async def list_conversations(repo_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Conversation)
        .where(Conversation.repository_id == repo_id)
        .options(selectinload(Conversation.messages))
        .order_by(Conversation.updated_at.desc())
    )
    res = await db.execute(stmt)
    convs = res.scalars().all()
    return [
        ConversationResponse(
            id=c.id,
            title=c.title,
            created_at=c.created_at.isoformat(),
            messages_count=len(c.messages),
        )
        for c in convs
    ]


@router.get("/{repo_id}/conversations/{conv_id}/messages")
async def get_conversation_messages(repo_id: uuid.UUID, conv_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Conversation)
        .where(Conversation.id == conv_id, Conversation.repository_id == repo_id)
        .options(selectinload(Conversation.messages))
    )
    res = await db.execute(stmt)
    conv = res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return [
        {
            "id": str(m.id),
            "role": m.role.value,
            "content": m.content_markdown,
            "verified_citations": m.verified_citations,
            "rejected_citations": m.rejected_citations,
            "is_abstained": m.is_abstained,
            "created_at": m.created_at.isoformat(),
        }
        for m in conv.messages
    ]


@router.post("/{repo_id}/chat/stream")
async def stream_chat(
    repo_id: uuid.UUID,
    payload: ChatStreamRequest,
    db: AsyncSession = Depends(get_db),
):
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    # Get or create conversation
    conv_id = payload.conversation_id
    if conv_id:
        conv = await db.get(Conversation, conv_id)
        if not conv:
            conv_id = None

    if not conv_id:
        conv = Conversation(
            id=uuid.uuid4(),
            repository_id=repo_id,
            title=query[:48] + ("..." if len(query) > 48 else ""),
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
        conv_id = conv.id

    # Record User Message
    user_msg = Message(
        id=uuid.uuid4(),
        conversation_id=conv_id,
        role=MessageRole.USER,
        content_markdown=query,
    )
    db.add(user_msg)
    await db.commit()

    # Retrieve relevant chunks
    chunks = await retriever.retrieve(
        session=db,
        repository_id=repo_id,
        query=query,
        top_k=8,
    )

    async def event_generator():
        # First send conversation_id
        yield f"data: {json.dumps({'type': 'init', 'conversation_id': str(conv_id)})}\n\n"

        full_content = []
        verified_citations = []
        rejected_citations = []
        is_abstained = False
        latency = 0

        async for chunk in llm_service.stream_grounded_answer(query, chunks):
            yield chunk
            # Parse chunk data for saving assistant message
            if chunk.startswith("data: "):
                try:
                    data = json.loads(chunk[6:].strip())
                    if data.get("type") == "token":
                        full_content.append(data.get("content", ""))
                    elif data.get("type") == "citations":
                        verified_citations = data.get("citations", [])
                        rejected_citations = data.get("rejected", [])
                    elif data.get("type") == "done":
                        is_abstained = data.get("is_abstained", False)
                        latency = data.get("latency_ms", 0)
                except Exception:
                    pass

        # Save Assistant message in background session
        async with AsyncSessionLocal() as save_db:
            asst_msg = Message(
                id=uuid.uuid4(),
                conversation_id=conv_id,
                role=MessageRole.ASSISTANT,
                content_markdown="".join(full_content),
                verified_citations=verified_citations,
                rejected_citations=rejected_citations,
                retrieved_chunk_ids=[str(c.chunk_id) for c in chunks],
                is_abstained=is_abstained,
                latency_ms=latency,
            )
            save_db.add(asst_msg)
            await save_db.commit()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
