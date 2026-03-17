"""Audit log service for recording and querying operator actions."""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from openclaw_orchestrator.database.db import get_db


class AuditLogService:
    """Persist and query operation audit logs."""

    def log_event(
        self,
        *,
        action: str,
        resource_type: str,
        team_id: str | None = None,
        actor: str = "api",
        resource_id: str | None = None,
        detail: str = "",
        metadata: dict[str, Any] | None = None,
        ok: bool = True,
        request_id: str | None = None,
    ) -> dict[str, Any]:
        db = get_db()
        entry_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO audit_logs (
                id, team_id, actor, action, resource_type, resource_id,
                detail, metadata_json, ok, request_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry_id,
                self._normalize_optional_text(team_id),
                self._normalize_text(actor, fallback="api"),
                self._normalize_text(action),
                self._normalize_text(resource_type),
                self._normalize_text(resource_id),
                str(detail or "").strip(),
                json.dumps(metadata or {}, ensure_ascii=False),
                1 if ok else 0,
                self._normalize_text(request_id),
            ),
        )
        db.commit()
        row = db.execute("SELECT * FROM audit_logs WHERE id = ?", (entry_id,)).fetchone()
        return self._row_to_dict(row)

    def list_logs(
        self,
        *,
        team_id: str | None = None,
        action: str | None = None,
        resource_type: str | None = None,
        ok: bool | None = None,
        query: str | None = None,
        start_at: str | None = None,
        end_at: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        db = get_db()
        clauses = ["1 = 1"]
        params: list[Any] = []

        normalized_team_id = self._normalize_optional_text(team_id)
        normalized_action = self._normalize_optional_text(action)
        normalized_resource_type = self._normalize_optional_text(resource_type)
        normalized_query = self._normalize_optional_text(query)
        normalized_start_at = self._normalize_optional_text(start_at)
        normalized_end_at = self._normalize_optional_text(end_at)

        if normalized_team_id:
            clauses.append("team_id = ?")
            params.append(normalized_team_id)
        if normalized_action:
            clauses.append("action = ?")
            params.append(normalized_action)
        if normalized_resource_type:
            clauses.append("resource_type = ?")
            params.append(normalized_resource_type)
        if ok is not None:
            clauses.append("ok = ?")
            params.append(1 if ok else 0)
        if normalized_start_at:
            clauses.append("datetime(created_at) >= datetime(?)")
            params.append(normalized_start_at)
        if normalized_end_at:
            clauses.append("datetime(created_at) <= datetime(?)")
            params.append(normalized_end_at)
        if normalized_query:
            clauses.append(
                "(actor LIKE ? OR action LIKE ? OR resource_type LIKE ? OR resource_id LIKE ? OR detail LIKE ? OR metadata_json LIKE ?)"
            )
            like_value = f"%{normalized_query}%"
            params.extend([like_value] * 6)

        where_sql = " AND ".join(clauses)
        normalized_limit = max(1, min(int(limit), 200))
        normalized_offset = max(int(offset), 0)

        total_row = db.execute(
            f"SELECT COUNT(*) AS total FROM audit_logs WHERE {where_sql}",
            tuple(params),
        ).fetchone()
        rows = db.execute(
            f"""
            SELECT *
            FROM audit_logs
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            tuple([*params, normalized_limit, normalized_offset]),
        ).fetchall()

        return {
            "items": [self._row_to_dict(row) for row in rows],
            "total": int(total_row["total"] or 0) if total_row else 0,
            "limit": normalized_limit,
            "offset": normalized_offset,
        }

    @staticmethod
    def resolve_actor(*, actor_id: Any = None, api_key: Any = None) -> str:
        explicit_actor = str(actor_id or "").strip()
        if explicit_actor:
            return explicit_actor
        normalized_api_key = str(api_key or "").strip()
        if normalized_api_key:
            digest = hashlib.sha256(normalized_api_key.encode("utf-8")).hexdigest()[:12]
            return f"api-key:{digest}"
        return "api"

    @staticmethod
    def _normalize_text(value: Any, fallback: str = "") -> str:
        text = str(value or "").strip()
        return text or fallback

    @staticmethod
    def _normalize_optional_text(value: Any) -> str | None:
        text = str(value or "").strip()
        return text or None

    @staticmethod
    def _row_to_dict(row: Any) -> dict[str, Any]:
        metadata_text = str(row["metadata_json"] or "").strip()
        metadata = json.loads(metadata_text) if metadata_text else {}
        return {
            "id": row["id"],
            "teamId": row["team_id"] or None,
            "actor": row["actor"],
            "action": row["action"],
            "resourceType": row["resource_type"],
            "resourceId": row["resource_id"] or None,
            "detail": row["detail"] or "",
            "metadata": metadata if isinstance(metadata, dict) else {},
            "ok": bool(row["ok"]),
            "requestId": row["request_id"] or None,
            "createdAt": row["created_at"],
        }


audit_log_service = AuditLogService()
