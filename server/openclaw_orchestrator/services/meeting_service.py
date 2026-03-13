"""Meeting service — orchestrate multi-agent meetings and debates.

Supports 7 meeting types:
  standup, kickoff, review, brainstorm, decision, retro, debate

Meeting execution model (shared-document pattern):
  1. Create meeting_<id>.md (template + topic)
  2. Sequentially invoke each participant Agent
     → Agent reads meeting.md → appends speech → replies done
     → If Agent didn't write to file, Orchestrator writes on behalf
  3. All speeches done → Lead reads full record → writes conclusion
  4. Conclusion auto-appended to team.md

Debate is a special Meeting subtype:
  - Fixed 2 participants, alternating multi-round (≤ maxRounds)
  - Consensus detection: early termination if both sides agree
  - Lead acts as judge to summarize
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from enum import Enum
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.utils.time import utc_now, utc_now_iso
from openclaw_orchestrator.services.file_manager import file_manager
from openclaw_orchestrator.services.notification_service import notification_service
from openclaw_orchestrator.websocket.ws_handler import broadcast

logger = logging.getLogger(__name__)


class MeetingType(str, Enum):
    STANDUP = "standup"
    KICKOFF = "kickoff"
    REVIEW = "review"
    BRAINSTORM = "brainstorm"
    DECISION = "decision"
    RETRO = "retro"
    DEBATE = "debate"


class MeetingStatus(str, Enum):
    PREPARING = "preparing"
    IN_PROGRESS = "in_progress"
    CONCLUDED = "concluded"
    CANCELLED = "cancelled"


# ── Prompt templates per meeting type ──

PARTICIPANT_PROMPT_TEMPLATES: dict[str, str] = {
    "standup": (
        "你正在参加一个站会。请阅读以下会议记录，然后在「发言记录」部分追加你的进度汇报。\n"
        "格式要求：\n"
        "### {agent_id} 的发言\n"
        "- **昨天完成**: ...\n"
        "- **今天计划**: ...\n"
        "- **遇到的阻碍**: ...\n\n"
        "会议文件内容：\n```\n{meeting_content}\n```"
    ),
    "kickoff": (
        "你正在参加一个项目启动会。Lead 已说明目标和分工。\n"
        "请阅读以下会议记录，确认你理解的职责并提出问题或建议。\n"
        "格式要求：\n"
        "### {agent_id} 的发言\n"
        "**理解的职责**: ...\n"
        "**问题/建议**: ...\n\n"
        "会议文件内容：\n```\n{meeting_content}\n```"
    ),
    "review": (
        "你正在参加一个评审会。前面已有 {speaker_index} 位同事发言。\n"
        "请阅读以下会议记录，针对议题和前人观点追加你的评审意见。\n"
        "格式要求：\n"
        "### {agent_id} 的发言\n"
        "**评审意见**: ...\n"
        "**建议**: ...\n\n"
        "会议文件内容：\n```\n{meeting_content}\n```"
    ),
    "brainstorm": (
        "你正在参加一个头脑风暴会。请在前人想法基础上补充你的创意。\n"
        "可以叠加、也可以挑战前人观点。\n"
        "格式要求：\n"
        "### {agent_id} 的发言\n"
        "**创意/想法**: ...\n\n"
        "会议文件内容：\n```\n{meeting_content}\n```"
    ),
    "decision": (
        "你正在参加一个决策会。请发表你的立场和理由，可以引用前人观点。\n"
        "格式要求：\n"
        "### {agent_id} 的发言\n"
        "**立场**: 支持/反对/中立\n"
        "**理由**: ...\n\n"
        "会议文件内容：\n```\n{meeting_content}\n```"
    ),
    "retro": (
        "你正在参加一个复盘会。请分享本次任务中学到的经验教训和改进建议。\n"
        "格式要求：\n"
        "### {agent_id} 的发言\n"
        "**做得好的**: ...\n"
        "**可改进的**: ...\n"
        "**行动建议**: ...\n\n"
        "会议文件内容：\n```\n{meeting_content}\n```"
    ),
}

DEBATE_PROMPT_TEMPLATE = (
    "你正在参加一场辩论（第 {round_num}/{max_rounds} 轮，你是{side}）。\n"
    "请阅读以下会议记录中的所有发言，然后追加你的论点。\n"
    "如果你同意对方观点，请在发言中明确表示「同意」或「达成共识」。\n"
    "格式要求：\n"
    "### {agent_id} 的发言（第{round_num}轮·{side}）\n"
    "**论点**: ...\n\n"
    "会议文件内容：\n```\n{meeting_content}\n```"
)

CONCLUDE_PROMPT = (
    "你是本次会议的主持人。请阅读以下完整的会议记录，生成会议结论。\n"
    "请包含以下内容：\n"
    "1. **关键共识**（大家都同意的）\n"
    "2. **分歧点**（如有）\n"
    "3. **行动项**（谁做什么、什么时候完成）\n"
    "4. **一句话总结**\n\n"
    "会议文件内容：\n```\n{meeting_content}\n```"
)

CONSENSUS_KEYWORDS = ["同意", "赞同", "没有异议", "agree", "consensus", "接受", "达成共识", "认同"]

# ── Meeting Markdown template ──

MEETING_MD_TEMPLATE = """# 团队会议：{topic}

> **类型**：{meeting_type} | **日期**：{date}
> **主持人**：{lead_agent_id}
> **参会者**：{participants}

---

## 议题

{topic_description}

---

## 发言记录

<!-- Agent 按顺序在此追加发言 -->

---

## 会议结论

<!-- 主持人总结 -->
"""


class MeetingService:
    """Service for managing meetings and debates."""

    # ────── Meeting CRUD ──────

    def create_meeting(
        self,
        team_id: str,
        meeting_type: str,
        topic: str,
        participants: list[str],
        topic_description: str = "",
        lead_agent_id: Optional[str] = None,
        max_rounds: int = 1,
    ) -> dict[str, Any]:
        """Create a new meeting."""
        db = get_db()
        meeting_id = str(uuid.uuid4())

        # Resolve lead: explicit > team lead > first participant
        if not lead_agent_id:
            from openclaw_orchestrator.services.team_service import team_service
            lead_agent_id = team_service.get_lead(team_id) or (participants[0] if participants else "unknown")

        # Validate debate constraints
        if meeting_type == MeetingType.DEBATE:
            if len(participants) != 2:
                raise ValueError("Debate requires exactly 2 participants")
            max_rounds = min(max(max_rounds, 1), 5)
        else:
            max_rounds = 1

        # Create meeting file
        meeting_dir = os.path.join("teams", team_id, "meetings")
        file_manager.ensure_dir(meeting_dir)
        meeting_file = os.path.join(meeting_dir, f"meeting_{meeting_id}.md")

        file_manager.write_file(
            meeting_file,
            MEETING_MD_TEMPLATE.format(
                topic=topic,
                meeting_type=meeting_type,
                date=utc_now().strftime("%Y-%m-%d %H:%M"),
                lead_agent_id=lead_agent_id,
                participants=", ".join(participants),
                topic_description=topic_description or topic,
            ),
        )

        # Insert DB record
        db.execute(
            """INSERT INTO meetings
               (id, team_id, meeting_type, topic, topic_description,
                lead_agent_id, participants, status, file_path, max_rounds)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                meeting_id,
                team_id,
                meeting_type,
                topic,
                topic_description,
                lead_agent_id,
                json.dumps(participants),
                MeetingStatus.PREPARING,
                meeting_file,
                max_rounds,
            ),
        )
        db.commit()

        # Broadcast event
        broadcast({
            "type": "meeting_created",
            "payload": {
                "meetingId": meeting_id,
                "teamId": team_id,
                "meetingType": meeting_type,
                "topic": topic,
            },
            "timestamp": utc_now_iso(),
        })

        return self.get_meeting(meeting_id)

    def get_meeting(self, meeting_id: str) -> dict[str, Any]:
        """Get meeting details."""
        db = get_db()
        row = db.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,)).fetchone()
        if not row:
            raise ValueError(f"Meeting not found: {meeting_id}")
        return self._map_row(row)

    def list_meetings(self, team_id: str, status: Optional[str] = None) -> list[dict[str, Any]]:
        """List meetings for a team."""
        db = get_db()
        if status:
            rows = db.execute(
                "SELECT * FROM meetings WHERE team_id = ? AND status = ? ORDER BY created_at DESC",
                (team_id, status),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM meetings WHERE team_id = ? ORDER BY created_at DESC",
                (team_id,),
            ).fetchall()
        return [self._map_row(r) for r in rows]

    def get_meeting_content(self, meeting_id: str) -> str:
        """Get meeting markdown content."""
        meeting = self.get_meeting(meeting_id)
        file_path = meeting["filePath"]
        if file_path and file_manager.file_exists(file_path):
            return file_manager.read_file(file_path)
        return ""

    # ────── Meeting Execution ──────

    async def run_meeting(self, meeting_id: str) -> dict[str, Any]:
        """Execute a meeting — sequentially invoke each participant."""
        meeting = self.get_meeting(meeting_id)

        if meeting["status"] not in (MeetingStatus.PREPARING, "preparing"):
            raise ValueError(f"Meeting {meeting_id} is not in 'preparing' status")

        # Update status
        self._update_status(meeting_id, MeetingStatus.IN_PROGRESS)

        meeting_type = meeting["meetingType"]
        if meeting_type == MeetingType.DEBATE or meeting_type == "debate":
            result = await self._run_debate(meeting)
        else:
            result = await self._run_standard_meeting(meeting)

        return result

    async def _run_standard_meeting(self, meeting: dict[str, Any]) -> dict[str, Any]:
        """Standard meeting: each participant speaks once in order."""
        from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge

        meeting_id = meeting["id"]
        participants = meeting["participants"]
        meeting_type = meeting["meetingType"]
        file_path = meeting["filePath"]

        for i, agent_id in enumerate(participants):
            # Read current meeting content
            meeting_content = file_manager.read_file(file_path) if file_manager.file_exists(file_path) else ""

            # Build prompt
            template = PARTICIPANT_PROMPT_TEMPLATES.get(meeting_type, PARTICIPANT_PROMPT_TEMPLATES["review"])
            prompt = template.format(
                agent_id=agent_id,
                meeting_content=meeting_content,
                speaker_index=i,
                total_speakers=len(participants),
            )

            # Invoke Agent
            try:
                result = await openclaw_bridge.invoke_agent(
                    agent_id=agent_id,
                    message=prompt,
                    session_id=f"meeting-{meeting_id[:8]}",
                    timeout_seconds=180,
                    correlation_id=f"mtg-{meeting_id[:8]}-{i}",
                )

                # If agent responded but didn't write to file, write on its behalf
                if result.get("success") and result.get("content"):
                    self._append_speech(file_path, agent_id, result["content"])
                elif not result.get("success"):
                    self._append_speech(file_path, agent_id, f"*（{agent_id} 未响应，已跳过）*")

            except Exception as e:
                logger.error("Meeting %s: Agent %s failed: %s", meeting_id, agent_id, e)
                self._append_speech(file_path, agent_id, f"*（{agent_id} 执行异常: {e}）*")

            # Update progress
            self._update_round(meeting_id, i + 1)
            broadcast({
                "type": "meeting_progress",
                "payload": {
                    "meetingId": meeting_id,
                    "agentId": agent_id,
                    "speakerIndex": i,
                    "totalSpeakers": len(participants),
                },
                "timestamp": utc_now_iso(),
            })

        # Conclude
        summary = await self._conclude_meeting(meeting)
        return {
            "meetingId": meeting_id,
            "status": "concluded",
            "summary": summary,
        }

    async def _run_debate(self, meeting: dict[str, Any]) -> dict[str, Any]:
        """Debate: 2 participants alternate for ≤ maxRounds."""
        from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge

        meeting_id = meeting["id"]
        participants = meeting["participants"]
        max_rounds = meeting.get("maxRounds", 3) or 3
        file_path = meeting["filePath"]
        agent_a, agent_b = participants[0], participants[1]

        for round_num in range(1, max_rounds + 1):
            # Agent A speaks
            content_a = await self._debate_turn(
                openclaw_bridge, meeting_id, file_path,
                agent_a, round_num, max_rounds, "正方",
            )

            # Agent B responds
            content_b = await self._debate_turn(
                openclaw_bridge, meeting_id, file_path,
                agent_b, round_num, max_rounds, "反方",
            )

            self._update_round(meeting_id, round_num)

            # Consensus detection
            if self._check_consensus(content_a, content_b):
                logger.info("Meeting %s: Consensus reached at round %d", meeting_id, round_num)
                self._append_speech(file_path, "__system__", f"*第 {round_num} 轮后双方达成共识，辩论提前结束。*")
                break

            broadcast({
                "type": "meeting_progress",
                "payload": {
                    "meetingId": meeting_id,
                    "round": round_num,
                    "maxRounds": max_rounds,
                    "agentA": agent_a,
                    "agentB": agent_b,
                },
                "timestamp": utc_now_iso(),
            })

        # Lead concludes as judge
        summary = await self._conclude_meeting(meeting)
        return {
            "meetingId": meeting_id,
            "status": "concluded",
            "summary": summary,
        }

    async def _debate_turn(
        self,
        bridge: Any,
        meeting_id: str,
        file_path: str,
        agent_id: str,
        round_num: int,
        max_rounds: int,
        side: str,
    ) -> str:
        """Single debate turn for one agent."""
        meeting_content = file_manager.read_file(file_path) if file_manager.file_exists(file_path) else ""

        prompt = DEBATE_PROMPT_TEMPLATE.format(
            agent_id=agent_id,
            meeting_content=meeting_content,
            round_num=round_num,
            max_rounds=max_rounds,
            side=side,
        )

        content = ""
        try:
            result = await bridge.invoke_agent(
                agent_id=agent_id,
                message=prompt,
                session_id=f"debate-{meeting_id[:8]}",
                timeout_seconds=180,
                correlation_id=f"debate-{meeting_id[:8]}-r{round_num}-{side}",
            )
            content = result.get("content", "")
            if content:
                self._append_speech(file_path, agent_id, content, f"第{round_num}轮·{side}")
            else:
                self._append_speech(file_path, agent_id, f"*（{agent_id} 未响应）*", f"第{round_num}轮·{side}")
        except Exception as e:
            logger.error("Debate %s: Agent %s round %d failed: %s", meeting_id, agent_id, round_num, e)
            self._append_speech(file_path, agent_id, f"*（执行异常: {e}）*", f"第{round_num}轮·{side}")

        return content

    async def _conclude_meeting(self, meeting: dict[str, Any]) -> str:
        """Let the lead agent summarize the meeting."""
        from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge

        meeting_id = meeting["id"]
        lead_agent_id = meeting["leadAgentId"]
        file_path = meeting["filePath"]
        team_id = meeting["teamId"]

        meeting_content = file_manager.read_file(file_path) if file_manager.file_exists(file_path) else ""
        prompt = CONCLUDE_PROMPT.format(meeting_content=meeting_content)

        summary = ""
        try:
            result = await openclaw_bridge.invoke_agent(
                agent_id=lead_agent_id,
                message=prompt,
                session_id=f"meeting-conclude-{meeting_id[:8]}",
                timeout_seconds=120,
                correlation_id=f"mtg-conclude-{meeting_id[:8]}",
            )
            summary = result.get("content", "")
        except Exception as e:
            logger.error("Meeting %s conclusion failed: %s", meeting_id, e)
            summary = f"*（会议总结生成失败: {e}）*"

        # Write conclusion to meeting file
        if file_manager.file_exists(file_path):
            content = file_manager.read_file(file_path)
            conclusion_marker = "## 会议结论"
            if conclusion_marker in content:
                parts = content.split(conclusion_marker)
                new_content = parts[0] + conclusion_marker + f"\n\n{summary}\n"
                file_manager.write_file(file_path, new_content)
            else:
                file_manager.write_file(file_path, content + f"\n\n## 会议结论\n\n{summary}\n")

        # Update status
        self._update_status(meeting_id, MeetingStatus.CONCLUDED, summary=summary)

        # Append summary to team.md
        self._append_to_team_md(team_id, meeting)

        # Broadcast
        broadcast({
            "type": "meeting_concluded",
            "payload": {
                "meetingId": meeting_id,
                "teamId": team_id,
                "summary": summary[:200],
            },
            "timestamp": utc_now_iso(),
        })

        notification_service.create_notification(
            type="meeting_concluded",
            title=f"会议已结束: {meeting['topic']}",
            message=summary[:200] if summary else "会议已结束",
        )

        return summary

    def cancel_meeting(self, meeting_id: str) -> dict[str, Any]:
        """Cancel a meeting."""
        self._update_status(meeting_id, MeetingStatus.CANCELLED)
        broadcast({
            "type": "meeting_cancelled",
            "payload": {"meetingId": meeting_id},
            "timestamp": utc_now_iso(),
        })
        return self.get_meeting(meeting_id)

    # ────── Helpers ──────

    def _append_speech(
        self,
        file_path: str,
        agent_id: str,
        content: str,
        tag: str = "",
    ) -> None:
        """Append a speech to the meeting markdown file."""
        if not file_manager.file_exists(file_path):
            return

        current = file_manager.read_file(file_path)
        timestamp = utc_now().strftime("%H:%M")
        header = f"### {agent_id}" + (f" ({tag})" if tag else "") + f" — {timestamp}"
        speech = f"\n\n{header}\n\n{content}\n"

        # Insert before "## 会议结论"
        marker = "## 会议结论"
        if marker in current:
            parts = current.split(marker)
            new_content = parts[0].rstrip() + speech + "\n---\n\n" + marker + parts[1]
        else:
            new_content = current + speech

        file_manager.write_file(file_path, new_content)

    def _check_consensus(self, text_a: str, text_b: str) -> bool:
        """Check if both sides reached consensus in a debate."""
        if not text_a or not text_b:
            return False
        text_a_lower = text_a.lower()
        text_b_lower = text_b.lower()
        for kw in CONSENSUS_KEYWORDS:
            if kw in text_a_lower and kw in text_b_lower:
                return True
        return False

    def _update_status(
        self,
        meeting_id: str,
        status: str,
        summary: Optional[str] = None,
    ) -> None:
        """Update meeting status in DB."""
        db = get_db()
        if status == MeetingStatus.CONCLUDED:
            db.execute(
                "UPDATE meetings SET status = ?, summary = ?, concluded_at = datetime('now') WHERE id = ?",
                (status, summary or "", meeting_id),
            )
        else:
            db.execute(
                "UPDATE meetings SET status = ? WHERE id = ?",
                (status, meeting_id),
            )
        db.commit()

    def _update_round(self, meeting_id: str, current_round: int) -> None:
        """Update current round number."""
        db = get_db()
        db.execute(
            "UPDATE meetings SET current_round = ? WHERE id = ?",
            (current_round, meeting_id),
        )
        db.commit()

    def _append_to_team_md(self, team_id: str, meeting: dict[str, Any]) -> None:
        """Append meeting summary to team.md."""
        team_md_path = os.path.join("teams", team_id, "team.md")
        if not file_manager.file_exists(team_md_path):
            return

        content = file_manager.read_file(team_md_path)
        date_str = utc_now().strftime("%Y-%m-%d")
        meeting_type_labels = {
            "standup": "站会", "kickoff": "启动会", "review": "评审会",
            "brainstorm": "头脑风暴", "decision": "决策会", "retro": "复盘会",
            "debate": "辩论",
        }
        type_label = meeting_type_labels.get(meeting["meetingType"], meeting["meetingType"])
        participants_str = ", ".join(meeting["participants"])
        summary = meeting.get("summary") or "无总结"

        entry = (
            f"\n\n### [{date_str}] {type_label}「{meeting['topic']}」\n\n"
            f"**参会**: {participants_str}\n"
            f"**结论**: {summary[:300]}\n"
        )
        file_manager.write_file(team_md_path, content + entry)

    @staticmethod
    def _map_row(row: Any) -> dict[str, Any]:
        """Map DB row to API response dict."""
        return {
            "id": row["id"],
            "teamId": row["team_id"],
            "meetingType": row["meeting_type"],
            "topic": row["topic"],
            "topicDescription": row["topic_description"],
            "leadAgentId": row["lead_agent_id"],
            "participants": json.loads(row["participants"] or "[]"),
            "status": row["status"],
            "filePath": row["file_path"],
            "summary": row["summary"],
            "maxRounds": row["max_rounds"],
            "currentRound": row["current_round"],
            "createdAt": row["created_at"],
            "concludedAt": row["concluded_at"],
        }


# Singleton
meeting_service = MeetingService()
