"""Team-scoped context assembly service.

Builds execution-time prompt context with strict team isolation, layered-read strategy,
and budget control.

Layer strategy:
- L1: task goal + latest executable handoff
- L2: L1 + more recent handoffs for dependency/blocking scenarios
- L3: L2 fallback + authorized decision summary from task.md (never raw meeting notes)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.services.task_service import task_service
from openclaw_orchestrator.services.team_service import team_service


@dataclass
class ContextSource:
    """A source item used to build final execution context."""

    kind: str
    path: str
    used_chars: int
    original_chars: int
    truncated: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "path": self.path,
            "usedChars": self.used_chars,
            "originalChars": self.original_chars,
            "truncated": self.truncated,
        }


class TeamContextService:
    """Assemble team-scoped context blocks for prompt injection."""

    _SAFE_TEAM_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")

    def build_context(
        self,
        *,
        team_id: str,
        task_id: str | None = None,
        scene: str = "workflow_task",
        read_level: str = "L1",
        include_authorized_decision: bool = False,
    ) -> dict[str, Any]:
        """Build context text and metadata for a specific team.

        Raises:
            ValueError: when team_id/task scope validation fails.
        """
        normalized_team_id = self._normalize_team_id(team_id)
        normalized_level = self._normalize_read_level(read_level)

        if task_id:
            self._ensure_task_belongs_to_team(task_id=task_id, team_id=normalized_team_id)

        total_budget = max(int(settings.context_budget_total_chars), 0)
        team_budget = max(int(settings.context_budget_team_chars), 0)
        task_budget = max(int(settings.context_budget_task_chars), 0)
        meeting_budget = max(int(settings.context_budget_meeting_chars), 0)

        remaining = total_budget
        pieces: list[str] = []
        sources: list[ContextSource] = []
        any_truncated = False

        # Team long-term consensus
        if remaining > 0 and team_budget > 0:
            team_md = team_service.get_team_md(normalized_team_id)
            chunk, source = self._consume(
                title="团队规则与长期共识",
                content=team_md,
                kind="team_md",
                path=f"teams/{normalized_team_id}/team.md",
                layer_budget=team_budget,
                remaining_budget=remaining,
            )
            if chunk:
                pieces.append(chunk)
                sources.append(source)
                remaining -= source.used_chars
                any_truncated = any_truncated or source.truncated

        # Task layered context (goal + handoffs)
        if task_id and remaining > 0 and task_budget > 0:
            goal_excerpt = task_service.get_task_goal_excerpt(
                task_id,
                max_chars=max(task_budget, 200),
            )
            goal_chunk, goal_source = self._consume(
                title="当前任务目标",
                content=goal_excerpt,
                kind="task_goal",
                path=f"task:{task_id}#任务描述",
                layer_budget=max(task_budget // 2, 240),
                remaining_budget=remaining,
            )
            if goal_chunk:
                pieces.append(goal_chunk)
                sources.append(goal_source)
                remaining -= goal_source.used_chars
                any_truncated = any_truncated or goal_source.truncated

            handoff_limit = 1
            if normalized_level == "L2":
                handoff_limit = max(int(settings.context_l2_handoff_items), 1)
            elif normalized_level == "L3":
                handoff_limit = max(int(settings.context_l3_handoff_items), 1)

            handoff_excerpt = task_service.get_handoff_excerpt(
                task_id,
                limit=handoff_limit,
                max_chars=max(task_budget, 300),
            )
            handoff_chunk, handoff_source = self._consume(
                title=f"最近可执行交接（{normalized_level}）",
                content=handoff_excerpt,
                kind="task_handoff",
                path=f"task:{task_id}#可执行交接区",
                layer_budget=max(task_budget // 2, 300),
                remaining_budget=remaining,
            )
            if handoff_chunk:
                pieces.append(handoff_chunk)
                sources.append(handoff_source)
                remaining -= handoff_source.used_chars
                any_truncated = any_truncated or handoff_source.truncated

        # L3 fallback: authorized meeting decision summary only
        if (
            task_id
            and normalized_level == "L3"
            and include_authorized_decision
            and remaining > 0
            and meeting_budget > 0
        ):
            decision_excerpt = task_service.get_authorized_decision_excerpt(
                task_id,
                max_chars=max(meeting_budget, 240),
            )
            chunk, source = self._consume(
                title="已授权决议摘要",
                content=decision_excerpt,
                kind="authorized_decision",
                path=f"task:{task_id}#决议摘要区",
                layer_budget=meeting_budget,
                remaining_budget=remaining,
            )
            if chunk:
                pieces.append(chunk)
                sources.append(source)
                remaining -= source.used_chars
                any_truncated = any_truncated or source.truncated

        content = "\n\n".join(piece for piece in pieces if piece).strip()

        return {
            "scene": scene,
            "teamId": normalized_team_id,
            "taskId": task_id,
            "readLevel": normalized_level,
            "content": content,
            "sources": [source.to_dict() for source in sources],
            "budget": {
                "total": total_budget,
                "used": sum(source.used_chars for source in sources),
                "remaining": max(remaining, 0),
            },
            "truncated": any_truncated,
        }

    def _normalize_team_id(self, team_id: str) -> str:
        normalized = str(team_id or "").strip()
        if not normalized:
            raise ValueError("team_id is required for team-scoped context")
        if not self._SAFE_TEAM_ID_RE.match(normalized):
            raise ValueError(f"invalid team_id: {team_id}")
        return normalized

    @staticmethod
    def _normalize_read_level(read_level: str) -> str:
        normalized = str(read_level or "L1").strip().upper()
        if normalized in {"L1", "L2", "L3"}:
            return normalized
        return "L1"

    @staticmethod
    def _ensure_task_belongs_to_team(*, task_id: str, team_id: str) -> None:
        task = task_service.get_task(task_id)
        if task.get("teamId") != team_id:
            raise ValueError(
                f"task {task_id} does not belong to team {team_id}"
            )

    @staticmethod
    def _truncate(text: str, limit: int) -> tuple[str, bool]:
        if limit <= 0:
            return "", bool(text)
        if len(text) <= limit:
            return text, False

        suffix = "\n...（已按预算截断）"
        if limit <= len(suffix):
            return suffix[:limit], True

        keep = max(limit - len(suffix), 0)
        return text[:keep].rstrip() + suffix, True

    def _consume(
        self,
        *,
        title: str,
        content: str,
        kind: str,
        path: str,
        layer_budget: int,
        remaining_budget: int,
    ) -> tuple[str, ContextSource]:
        raw = str(content or "").strip()
        original_chars = len(raw)
        effective_budget = max(min(layer_budget, remaining_budget), 0)

        trimmed, truncated = self._truncate(raw, effective_budget)
        used = len(trimmed)

        if not trimmed:
            return "", ContextSource(
                kind=kind,
                path=path,
                used_chars=0,
                original_chars=original_chars,
                truncated=bool(original_chars),
            )

        block = f"## {title}\n{trimmed}"
        return block, ContextSource(
            kind=kind,
            path=path,
            used_chars=used,
            original_chars=original_chars,
            truncated=truncated,
        )


team_context_service = TeamContextService()
