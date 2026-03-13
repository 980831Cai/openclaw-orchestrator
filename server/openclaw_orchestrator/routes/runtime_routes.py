from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from openclaw_orchestrator.services.runtime_service import RuntimeServiceError, runtime_service

router = APIRouter()


@router.get("/runtime/gateway")
def get_gateway_runtime_status():
    return runtime_service.get_gateway_status()


@router.post("/runtime/gateway/start")
async def start_gateway_runtime():
    try:
        return await run_in_threadpool(runtime_service.start_gateway)
    except RuntimeServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/runtime/gateway/stop")
async def stop_gateway_runtime():
    try:
        return await run_in_threadpool(runtime_service.stop_gateway)
    except RuntimeServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/runtime/gateway/restart")
async def restart_gateway_runtime():
    try:
        return await run_in_threadpool(runtime_service.restart_gateway)
    except RuntimeServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
