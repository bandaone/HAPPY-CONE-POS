import asyncio
import json
from fastapi import APIRouter,Depends,Request,HTTPException
from fastapi.responses import StreamingResponse
from app.api.deps import bearer
from app.domains.identity.service import session_user
from app.models.base import BranchLock

router=APIRouter(prefix='/api')


def authorized_revision(factory,token):
    with factory() as db:
        session_user(db,token)
        row=db.get(BranchLock,1)
        return str(row.revision) if row else '0'


@router.get('/events')
async def events(request: Request,credentials=Depends(bearer)):
    if not credentials:
        raise HTTPException(401,'Authentication required')
    factory=request.app.state.session_factory
    await asyncio.to_thread(authorized_revision,factory,credentials.credentials)

    async def stream():
        previous=None
        heartbeat=0
        while not await request.is_disconnected():
            try:
                revision=await asyncio.to_thread(authorized_revision,factory,credentials.credentials)
            except HTTPException:
                yield 'event: session-expired\ndata: {}\n\n'
                return
            if revision!=previous:
                yield f"event: orders\ndata: {json.dumps({'revision':revision})}\n\n"
                previous=revision
            heartbeat+=1
            if heartbeat%15==0:
                yield ': keepalive\n\n'
            await asyncio.sleep(1)
    return StreamingResponse(stream(),media_type='text/event-stream',headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no'})
