"""Team-scoped usage aggregation service."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.utils.time import utc_now


class TeamUsageService:
    """Aggregate execution and token usage metrics for a team."""

    def get_summary(self, team_id: str, days: int = 7) -> dict[str, Any]:
        db = get_db()
        start_at, end_at = self._resolve_window(days)
        row = db.execute(
            """
            SELECT
                COUNT(*) AS execution_count,
                SUM(CASE WHEN we.status = 'completed' THEN 1 ELSE 0 END) AS success_count,
                AVG(CASE WHEN we.completed_at IS NOT NULL
                    THEN (julianday(we.completed_at) - julianday(we.started_at)) * 86400000
                    ELSE NULL END
                ) AS avg_duration_ms,
                SUM(we.prompt_tokens) AS prompt_tokens,
                SUM(we.completion_tokens) AS completion_tokens,
                SUM(we.total_tokens) AS total_tokens,
                SUM(we.estimated_cost_usd) AS estimated_cost_usd,
                SUM(CASE WHEN we.usage_metrics_count > 0 THEN 1 ELSE 0 END) AS covered_execution_count
            FROM workflow_executions we
            INNER JOIN workflows w ON w.id = we.workflow_id
            WHERE w.team_id = ?
              AND datetime(we.started_at) >= datetime(?)
              AND datetime(we.started_at) <= datetime(?)
            """,
            (team_id, start_at, end_at),
        ).fetchone()

        execution_count = int(row["execution_count"] or 0) if row else 0
        success_count = int(row["success_count"] or 0) if row else 0
        covered_execution_count = int(row["covered_execution_count"] or 0) if row else 0
        success_rate = round(success_count / execution_count, 4) if execution_count else 0.0
        coverage_rate = round(covered_execution_count / execution_count, 4) if execution_count else 0.0

        return {
            "teamId": team_id,
            "rangeDays": max(1, int(days)),
            "window": {"startAt": start_at, "endAt": end_at},
            "executionCount": execution_count,
            "successCount": success_count,
            "successRate": success_rate,
            "avgDurationMs": int(float(row["avg_duration_ms"] or 0)) if row else 0,
            "promptTokens": int(row["prompt_tokens"] or 0) if row else 0,
            "completionTokens": int(row["completion_tokens"] or 0) if row else 0,
            "totalTokens": int(row["total_tokens"] or 0) if row else 0,
            "estimatedCostUsd": round(float(row["estimated_cost_usd"] or 0), 6) if row else 0.0,
            "coveredExecutionCount": covered_execution_count,
            "coverageRate": coverage_rate,
        }

    def get_trend(self, team_id: str, days: int = 7) -> list[dict[str, Any]]:
        db = get_db()
        start_at, end_at = self._resolve_window(days)
        rows = db.execute(
            """
            SELECT
                DATE(created_at) AS bucket,
                COUNT(DISTINCT execution_id) AS execution_count,
                SUM(prompt_tokens) AS prompt_tokens,
                SUM(completion_tokens) AS completion_tokens,
                SUM(total_tokens) AS total_tokens,
                SUM(estimated_cost_usd) AS estimated_cost_usd,
                SUM(has_usage) AS usage_samples_count
            FROM execution_usage_metrics
            WHERE team_id = ?
              AND datetime(created_at) >= datetime(?)
              AND datetime(created_at) <= datetime(?)
            GROUP BY DATE(created_at)
            ORDER BY bucket ASC
            """,
            (team_id, start_at, end_at),
        ).fetchall()
        return [
            {
                "date": row["bucket"],
                "executionCount": int(row["execution_count"] or 0),
                "promptTokens": int(row["prompt_tokens"] or 0),
                "completionTokens": int(row["completion_tokens"] or 0),
                "totalTokens": int(row["total_tokens"] or 0),
                "estimatedCostUsd": round(float(row["estimated_cost_usd"] or 0), 6),
                "usageSamplesCount": int(row["usage_samples_count"] or 0),
            }
            for row in rows
        ]

    def get_model_breakdown(self, team_id: str, days: int = 7, limit: int = 10) -> list[dict[str, Any]]:
        return self._get_usage_breakdown(team_id, days, "COALESCE(NULLIF(model, ''), 'unknown')", "model", limit)

    def get_agent_breakdown(self, team_id: str, days: int = 7, limit: int = 10) -> list[dict[str, Any]]:
        return self._get_usage_breakdown(team_id, days, "COALESCE(NULLIF(agent_id, ''), 'unknown')", "agentId", limit)

    def get_workflow_breakdown(self, team_id: str, days: int = 7, limit: int = 10) -> list[dict[str, Any]]:
        db = get_db()
        start_at, end_at = self._resolve_window(days)
        rows = db.execute(
            """
            SELECT
                eum.workflow_id AS workflow_id,
                COALESCE(NULLIF(w.name, ''), eum.workflow_id) AS workflow_name,
                COUNT(DISTINCT eum.execution_id) AS execution_count,
                SUM(eum.prompt_tokens) AS prompt_tokens,
                SUM(eum.completion_tokens) AS completion_tokens,
                SUM(eum.total_tokens) AS total_tokens,
                SUM(eum.estimated_cost_usd) AS estimated_cost_usd,
                AVG(eum.duration_ms) AS avg_duration_ms
            FROM execution_usage_metrics eum
            LEFT JOIN workflows w ON w.id = eum.workflow_id
            WHERE eum.team_id = ?
              AND datetime(eum.created_at) >= datetime(?)
              AND datetime(eum.created_at) <= datetime(?)
            GROUP BY eum.workflow_id, workflow_name
            ORDER BY total_tokens DESC, execution_count DESC
            LIMIT ?
            """,
            (team_id, start_at, end_at, max(1, min(int(limit), 50))),
        ).fetchall()
        return [
            {
                "workflowId": row["workflow_id"],
                "workflowName": row["workflow_name"],
                "executionCount": int(row["execution_count"] or 0),
                "promptTokens": int(row["prompt_tokens"] or 0),
                "completionTokens": int(row["completion_tokens"] or 0),
                "totalTokens": int(row["total_tokens"] or 0),
                "estimatedCostUsd": round(float(row["estimated_cost_usd"] or 0), 6),
                "avgDurationMs": int(float(row["avg_duration_ms"] or 0)),
            }
            for row in rows
        ]

    def _get_usage_breakdown(
        self,
        team_id: str,
        days: int,
        group_expr: str,
        label_key: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        db = get_db()
        start_at, end_at = self._resolve_window(days)
        rows = db.execute(
            f"""
            SELECT
                {group_expr} AS bucket,
                COUNT(DISTINCT execution_id) AS execution_count,
                SUM(prompt_tokens) AS prompt_tokens,
                SUM(completion_tokens) AS completion_tokens,
                SUM(total_tokens) AS total_tokens,
                SUM(estimated_cost_usd) AS estimated_cost_usd,
                AVG(duration_ms) AS avg_duration_ms
            FROM execution_usage_metrics
            WHERE team_id = ?
              AND datetime(created_at) >= datetime(?)
              AND datetime(created_at) <= datetime(?)
            GROUP BY bucket
            ORDER BY total_tokens DESC, execution_count DESC
            LIMIT ?
            """,
            (team_id, start_at, end_at, max(1, min(int(limit), 50))),
        ).fetchall()
        return [
            {
                label_key: row["bucket"],
                "executionCount": int(row["execution_count"] or 0),
                "promptTokens": int(row["prompt_tokens"] or 0),
                "completionTokens": int(row["completion_tokens"] or 0),
                "totalTokens": int(row["total_tokens"] or 0),
                "estimatedCostUsd": round(float(row["estimated_cost_usd"] or 0), 6),
                "avgDurationMs": int(float(row["avg_duration_ms"] or 0)),
            }
            for row in rows
        ]

    @staticmethod
    def _resolve_window(days: int) -> tuple[str, str]:
        normalized_days = max(1, min(int(days), 90))
        end_at = utc_now()
        start_at = end_at - timedelta(days=normalized_days - 1)
        return (
            start_at.strftime("%Y-%m-%d 00:00:00"),
            end_at.strftime("%Y-%m-%d %H:%M:%S"),
        )


team_usage_service = TeamUsageService()
