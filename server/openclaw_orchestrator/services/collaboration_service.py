"""Collaboration Coordination Service.

Handles automatic meeting triggers based on agent collaboration needs:
1. Agent encounters a collaboration problem → requests meeting suggestion
2. Lead evaluates and decides whether to create a meeting
3. Meeting is auto-created and executed if approved

Trigger conditions:
- Agent needs input from other members to proceed
- Decision-making required beyond agent's authority
- Task exceeds agent's capabilities
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.websocket.ws_handler import broadcast

logger = logging.getLogger(__name__)


class CollaborationService:
    """Service for coordinating inter-agent collaboration and automatic meetings."""

    # Prompt templates for Lead decision-making
    LEAD_DECISION_PROMPT = """你是团队管理者，需要决定是否召开团队会议。

当前情况：
{situation}

请求开会的 Agent：{requester_agent_id}
会议类型建议：{suggested_type}
议题：{topic}

请评估是否需要召开会议，并给出决策：
1. **决策**：同意 / 拒绝
2. **理由**：为什么做出这个决策
3. **参与者建议**：如果同意，建议哪些成员参加（agent ID 列表）
4. **会议形式**：standup（站会）/ decision（决策会）/ brainstorm（头脑风暴）/ review（评审会）

请以 JSON 格式回复：
```json
{{
  "decision": "approve" | "reject",
  "reason": "...",
  "participants": ["agent-id-1", "agent-id-2"],
  "meeting_type": "standup" | "decision" | "brainstorm" | "review"
}}
```
"""

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
        """Agent requests a meeting. Lead will evaluate and decide.

        Args:
            team_id: The team ID
            requester_agent_id: The agent requesting the meeting
            situation: Description of why the meeting is needed
            suggested_type: Suggested meeting type
            topic: Meeting topic

        Returns:
            Dict with request status and meeting info if approved
        """
        from openclaw_orchestrator.services.team_service import team_service
        from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge

        # Get team Lead
        lead_agent_id = team_service.get_lead(team_id)
        if not lead_agent_id:
            return {
                "success": False,
                "error": "No team Lead found",
            }

        # Create request record
        request_id = str(uuid.uuid4())
        request_record = {
            "id": request_id,
            "team_id": team_id,
            "requester_agent_id": requester_agent_id,
            "lead_agent_id": lead_agent_id,
            "situation": situation,
            "suggested_type": suggested_type,
            "topic": topic,
            "status": "pending",
            "created_at": datetime.utcnow().isoformat(),
        }
        self._pending_requests[request_id] = request_record

        # Build prompt for Lead
        prompt = self.LEAD_DECISION_PROMPT.format(
            situation=situation,
            requester_agent_id=requester_agent_id,
            suggested_type=suggested_type,
            topic=topic,
        )

        # Ask Lead to decide
        try:
            result = await openclaw_bridge.invoke_agent(
                agent_id=lead_agent_id,
                message=prompt,
                session_id=f"lead-decision-{request_id[:8]}",
                timeout_seconds=60,
                correlation_id=f"lead-decision-{request_id[:8]}",
            )

            if not result.get("success"):
                logger.warning("Lead decision request failed: %s", result.get("content"))
                request_record["status"] = "failed"
                return {
                    "success": False,
                    "error": "Lead did not respond",
                    "request_id": request_id,
                }

            # Parse Lead's decision
            decision = self._parse_lead_decision(result.get("content", ""))
            request_record["decision"] = decision

            if decision.get("decision") == "approve":
                # Create the meeting
                meeting = await self._create_approved_meeting(
                    request_record, decision
                )
                request_record["status"] = "approved"
                request_record["meeting_id"] = meeting.get("id")

                # Notify
                broadcast({
                    "type": "meeting_auto_created",
                    "payload": {
                        "request_id": request_id,
                        "meeting_id": meeting.get("id"),
                        "team_id": team_id,
                        "topic": topic,
                        "reason": decision.get("reason"),
                    },
                    "timestamp": datetime.utcnow().isoformat(),
                })

                return {
                    "success": True,
                    "approved": True,
                    "request_id": request_id,
                    "meeting": meeting,
                    "reason": decision.get("reason"),
                }
            else:
                request_record["status"] = "rejected"
                return {
                    "success": True,
                    "approved": False,
                    "request_id": request_id,
                    "reason": decision.get("reason"),
                }

        except Exception as e:
            logger.error("Failed to process meeting request: %s", e)
            request_record["status"] = "error"
            return {
                "success": False,
                "error": str(e),
                "request_id": request_id,
            }

    def _parse_lead_decision(self, content: str) -> dict[str, Any]:
        """Parse Lead's decision from response content."""
        decision = {
            "decision": "reject",
            "reason": "无法解析决策",
            "participants": [],
            "meeting_type": "decision",
        }

        # Try to extract JSON
        try:
            # Find JSON block
            if "```json" in content:
                json_start = content.find("```json") + 7
                json_end = content.find("```", json_start)
                json_str = content[json_start:json_end].strip()
            elif "```" in content:
                json_start = content.find("```") + 3
                json_end = content.find("```", json_start)
                json_str = content[json_start:json_end].strip()
            else:
                json_str = content

            parsed = json.loads(json_str)

            if "decision" in parsed:
                decision["decision"] = parsed["decision"]
            if "reason" in parsed:
                decision["reason"] = parsed["reason"]
            if "participants" in parsed:
                decision["participants"] = parsed["participants"]
            if "meeting_type" in parsed:
                decision["meeting_type"] = parsed["meeting_type"]

        except (json.JSONDecodeError, ValueError) as e:
            logger.warning("Failed to parse Lead decision JSON: %s", e)
            # Fallback: simple text parsing
            content_lower = content.lower()
            if "同意" in content or "approve" in content_lower:
                decision["decision"] = "approve"
            decision["reason"] = content[:200]  # Use first 200 chars as reason

        return decision

    async def _create_approved_meeting(
        self, request: dict[str, Any], decision: dict[str, Any]
    ) -> dict[str, Any]:
        """Create a meeting based on Lead's approval."""
        from openclaw_orchestrator.services.meeting_service import meeting_service

        team_id = request["team_id"]
        lead_agent_id = request["lead_agent_id"]
        topic = request["topic"]
        meeting_type = decision.get("meeting_type", "decision")
        participants = decision.get("participants", [])

        # If no participants specified, get all team members
        if not participants:
            db = get_db()
            rows = db.execute(
                "SELECT agent_id FROM team_members WHERE team_id = ?",
                (team_id,),
            ).fetchall()
            participants = [r["agent_id"] for r in rows]

        # Ensure Lead is in participants
        if lead_agent_id not in participants:
            participants.insert(0, lead_agent_id)

        # Create the meeting
        meeting = meeting_service.create_meeting(
            team_id=team_id,
            meeting_type=meeting_type,
            topic=topic,
            participants=participants,
            topic_description=f"自动触发：{request['situation']}\n\nLead决策理由：{decision.get('reason', '')}",
            lead_agent_id=lead_agent_id,
        )

        # Auto-run the meeting
        try:
            result = await meeting_service.run_meeting(meeting["id"])
            meeting["result"] = result
        except Exception as e:
            logger.error("Failed to auto-run meeting %s: %s", meeting["id"], e)
            meeting["run_error"] = str(e)

        return meeting

    def get_pending_requests(self, team_id: Optional[str] = None) -> list[dict[str, Any]]:
        """Get pending meeting requests."""
        requests = list(self._pending_requests.values())
        if team_id:
            requests = [r for r in requests if r["team_id"] == team_id]
        return [r for r in requests if r["status"] == "pending"]

    def get_request(self, request_id: str) -> Optional[dict[str, Any]]:
        """Get a specific meeting request."""
        return self._pending_requests.get(request_id)


# Singleton
collaboration_service = CollaborationService()
