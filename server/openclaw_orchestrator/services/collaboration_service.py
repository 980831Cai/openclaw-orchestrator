"""Collaboration coordination service."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from openclaw_orchestrator.database.db import get_db


class CollaborationService:
    def __init__(self) -> None:
        self._pending_requests: dict[str, dict[str, Any]] = {}

    async def request_meeting(
        self,
        team_id: str,
        requester_agent_id: str,
        situation: str,
        suggested_type: str = "decision",
        topic: str = "团队协作会议",
    ) -> dict[str, Any]:
        from openclaw_orchestrator.services.meeting_service import meeting_service
        from openclaw_orchestrator.services.team_service import team_service

        lead_agent_id = team_service.get_lead(team_id)
        if not lead_agent_id:
            return {"success": False, "error": "No team Lead found"}

        request_id = str(uuid.uuid4())
        request = {
            "id": request_id,
            "team_id": team_id,
            "requester_agent_id": requester_agent_id,
            "lead_agent_id": lead_agent_id,
            "situation": situation,
            "suggested_type": suggested_type,
            "topic": topic,
            "status": "approved",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }

        participants = self._resolve_participants(team_id, lead_agent_id, requester_agent_id)
        meeting = meeting_service.create_meeting(
            team_id=team_id,
            meeting_type=suggested_type,
            topic=topic,
            participants=participants,
            topic_description=f"自动触发：{situation}",
            lead_agent_id=lead_agent_id,
        )

        request["meeting"] = meeting
        self._pending_requests[request_id] = request

        self._persist_request(request)

        return {
            "success": True,
            "approved": True,
            "request_id": request_id,
            "meeting": meeting,
            "reason": "auto-approved by orchestrator",
        }

    def get_pending_requests(self, team_id: str) -> list[dict[str, Any]]:
        requests = [
            req
            for req in self._pending_requests.values()
            if req.get("team_id") == team_id and req.get("status") in {"pending", "approved"}
        ]
        return sorted(requests, key=lambda item: item.get("created_at", ""), reverse=True)

    def get_request(self, request_id: str) -> dict[str, Any] | None:
        request = self._pending_requests.get(request_id)
        if request:
            return request
        return self._load_request_from_db(request_id)

    def _resolve_participants(self, team_id: str, lead_agent_id: str, requester_agent_id: str) -> list[str]:
        db = get_db()
        rows = db.execute(
            "SELECT agent_id FROM team_members WHERE team_id = ?",
            (team_id,),
        ).fetchall()
        participants = [row["agent_id"] for row in rows if row.get("agent_id")]
        if requester_agent_id and requester_agent_id not in participants:
            participants.append(requester_agent_id)
        if lead_agent_id and lead_agent_id not in participants:
            participants.insert(0, lead_agent_id)
        return participants

    def _persist_request(self, request: dict[str, Any]) -> None:
        db = get_db()
        db.execute(
            """
            INSERT OR REPLACE INTO workflow_state (workflow_id, key, value_json)
            VALUES (?, ?, ?)
            """,
            (
                request.get("team_id", "default"),
                f"collaboration_request:{request['id']}",
                __import__("json").dumps(request, ensure_ascii=False),
            ),
        )
        db.commit()

    def _load_request_from_db(self, request_id: str) -> dict[str, Any] | None:
        db = get_db()
        row = db.execute(
            "SELECT value_json FROM workflow_state WHERE key = ? LIMIT 1",
            (f"collaboration_request:{request_id}",),
        ).fetchone()
        if not row:
            return None
        import json

        try:
            parsed = json.loads(row["value_json"] or "{}")
        except Exception:
            return None
        if isinstance(parsed, dict):
            self._pending_requests[request_id] = parsed
            return parsed
        return None


collaboration_service = CollaborationService()
