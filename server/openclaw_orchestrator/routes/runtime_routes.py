from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from openclaw_orchestrator.services.audit_log_service import audit_log_service
from openclaw_orchestrator.services.runtime_service import RuntimeServiceError, runtime_service

router = APIRouter()


def _request_actor(request: Request) -> str:
    return audit_log_service.resolve_actor(
        actor_id=request.headers.get("X-Actor-Id"),
        api_key=request.headers.get("X-API-Key") or request.query_params.get("api_key"),
    )


def _audit(request: Request, *, action: str, detail: str, ok: bool = True, metadata: dict | None = None) -> None:
    audit_log_service.log_event(
        actor=_request_actor(request),
        action=action,
        resource_type="runtime_gateway",
        resource_id="gateway",
        detail=detail,
        metadata=metadata,
        ok=ok,
        request_id=request.headers.get("X-Request-Id"),
    )


@router.get("/runtime/gateway")
def get_gateway_runtime_status():
    return runtime_service.get_gateway_status()


@router.post("/runtime/gateway/start")
async def start_gateway_runtime(request: Request):
    try:
        result = await run_in_threadpool(runtime_service.start_gateway)
        _audit(request, action="runtime.gateway.start", detail="启动 Gateway 运行时")
        return result
    except RuntimeServiceError as exc:
        _audit(request, action="runtime.gateway.start", detail=f"启动 Gateway 失败: {exc}", ok=False)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/runtime/gateway/stop")
async def stop_gateway_runtime(request: Request):
    try:
        result = await run_in_threadpool(runtime_service.stop_gateway)
        _audit(request, action="runtime.gateway.stop", detail="停止 Gateway 运行时")
        return result
    except RuntimeServiceError as exc:
        _audit(request, action="runtime.gateway.stop", detail=f"停止 Gateway 失败: {exc}", ok=False)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/runtime/gateway/restart")
async def restart_gateway_runtime(request: Request):
    try:
        result = await run_in_threadpool(runtime_service.restart_gateway)
        _audit(request, action="runtime.gateway.restart", detail="重启 Gateway 运行时")
        return result
    except RuntimeServiceError as exc:
        _audit(request, action="runtime.gateway.restart", detail=f"重启 Gateway 失败: {exc}", ok=False)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
