import { Type } from "@sinclair/typebox";

import type { OrchestratorPluginApi, OrchestratorPluginToolContext } from "./plugin-sdk-compat.js";
import { jsonResult, stringEnum } from "./plugin-sdk-compat.js";
import { createOrchestratorClient, type OrchestratorPluginConfig } from "./client.js";

const KNOWLEDGE_SCOPE_VALUES = ["agent", "team"] as const;
const APPROVAL_ACTION_VALUES = ["approve", "reject"] as const;

const KnowledgeScopeSchema = stringEnum(KNOWLEDGE_SCOPE_VALUES, {
  description: "Knowledge scope: agent or team.",
});

const ApprovalActionSchema = stringEnum(APPROVAL_ACTION_VALUES, {
  description: "Approval action: approve or reject.",
});

const KnowledgeListParamsSchema = Type.Object(
  {
    scope: KnowledgeScopeSchema,
    targetId: Type.String({ description: "Agent ID or team ID." }),
  },
  { additionalProperties: false },
);

const KnowledgeSearchParamsSchema = Type.Object(
  {
    scope: KnowledgeScopeSchema,
    targetId: Type.String({ description: "Agent ID or team ID." }),
    query: Type.String({ description: "Search query." }),
  },
  { additionalProperties: false },
);

const KnowledgeAddParamsSchema = Type.Object(
  {
    scope: KnowledgeScopeSchema,
    targetId: Type.String({ description: "Agent ID or team ID." }),
    sourceType: Type.String({ description: "Source type, for example file or url." }),
    sourcePath: Type.String({ description: "File path or URL." }),
    title: Type.String({ description: "Knowledge item title." }),
  },
  { additionalProperties: false },
);

const WorkflowPayloadSchema = Type.Object(
  {
    teamId: Type.String({ description: "Owning team ID." }),
    name: Type.String({ description: "Workflow name." }),
    nodes: Type.Optional(Type.Unknown({ description: "Workflow nodes object." })),
    edges: Type.Optional(Type.Unknown({ description: "Workflow edges array." })),
    schedule: Type.Optional(Type.Unknown({ description: "Workflow schedule config." })),
  },
  { additionalProperties: false },
);

const WorkflowUpdateSchema = Type.Object(
  {
    workflowId: Type.String({ description: "Workflow ID." }),
    name: Type.Optional(Type.String({ description: "Workflow name." })),
    nodes: Type.Optional(Type.Unknown({ description: "Workflow nodes object." })),
    edges: Type.Optional(Type.Unknown({ description: "Workflow edges array." })),
    schedule: Type.Optional(Type.Unknown({ description: "Workflow schedule config." })),
  },
  { additionalProperties: false },
);

const TeamCreateSchema = Type.Object(
  {
    name: Type.String({ description: "Team name." }),
    description: Type.Optional(Type.String({ description: "Team description." })),
    goal: Type.Optional(Type.String({ description: "Team goal." })),
    theme: Type.Optional(Type.String({ description: "Team theme." })),
  },
  { additionalProperties: false },
);

const TeamMemberSchema = Type.Object(
  {
    teamId: Type.String({ description: "Team ID." }),
    agentId: Type.String({ description: "Agent ID." }),
    role: Type.Optional(Type.String({ description: "Member role." })),
  },
  { additionalProperties: false },
);

function actorFromContext(ctx: OrchestratorPluginToolContext): string {
  return ctx.agentId || ctx.sessionKey || ctx.agentAccountId || ctx.messageChannel || "plugin";
}

function scopePath(scope: (typeof KNOWLEDGE_SCOPE_VALUES)[number], targetId: string): string {
  return scope === "agent" ? `/agents/${targetId}/knowledge` : `/teams/${targetId}/knowledge`;
}

export const ORCHESTRATOR_TOOL_NAMES = [
  "orchestrator_status",
  "orchestrator_list_agents",
  "orchestrator_get_agent",
  "orchestrator_list_teams",
  "orchestrator_get_team",
  "orchestrator_create_team",
  "orchestrator_add_team_member",
  "orchestrator_list_workflows",
  "orchestrator_get_workflow",
  "orchestrator_create_workflow",
  "orchestrator_update_workflow",
  "orchestrator_execute_workflow",
  "orchestrator_get_execution",
  "orchestrator_list_pending_approvals",
  "orchestrator_resolve_approval",
  "orchestrator_list_sessions",
  "orchestrator_send_agent_message",
  "orchestrator_list_knowledge",
  "orchestrator_add_knowledge",
  "orchestrator_search_knowledge",
] as const;

type KnowledgeScope = (typeof KNOWLEDGE_SCOPE_VALUES)[number];
type ApprovalAction = (typeof APPROVAL_ACTION_VALUES)[number];

type WorkflowQuery = {
  teamId?: string;
};

type WorkflowGet = {
  workflowId: string;
};

type WorkflowExecute = {
  workflowId: string;
};

type ExecutionGet = {
  executionId: string;
};

type AgentGet = {
  agentId: string;
};

type TeamGet = {
  teamId: string;
};

type TeamCreate = {
  name: string;
  description?: string;
  goal?: string;
  theme?: string;
};

type TeamMemberAdd = {
  teamId: string;
  agentId: string;
  role?: string;
};

type WorkflowCreate = {
  teamId: string;
  name: string;
  nodes?: unknown;
  edges?: unknown;
  schedule?: unknown;
};

type WorkflowUpdate = {
  workflowId: string;
  name?: string;
  nodes?: unknown;
  edges?: unknown;
  schedule?: unknown;
};

type ApprovalResolve = {
  approvalId: string;
  action: ApprovalAction;
  rejectReason?: string;
};

type SessionList = {
  agentId: string;
};

type SendMessage = {
  agentId: string;
  content: string;
  sessionId?: string;
};

type KnowledgeList = {
  scope: KnowledgeScope;
  targetId: string;
};

type KnowledgeAdd = {
  scope: KnowledgeScope;
  targetId: string;
  sourceType: string;
  sourcePath: string;
  title: string;
};

type KnowledgeSearch = {
  scope: KnowledgeScope;
  targetId: string;
  query: string;
};

export function createOrchestratorTools(
  _api: OrchestratorPluginApi,
  config: OrchestratorPluginConfig,
  ctx: OrchestratorPluginToolContext,
) {
  const client = createOrchestratorClient(config);

  return [
    {
      name: "orchestrator_status",
      label: "Orchestrator Status",
      description: "Check the orchestrator connection and active plugin config.",
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute() {
        let health: unknown = null;
        let reachable = false;
        let error: string | null = null;

        try {
          health = await client.health();
          reachable = true;
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause);
        }

        return jsonResult({
          requestedBy: actorFromContext(ctx),
          pluginId: "openclaw-orchestrator",
          ...client.config,
          reachable,
          health,
          error,
        });
      },
    },
    {
      name: "orchestrator_list_agents",
      label: "Orchestrator List Agents",
      description: "List agents known to the orchestrator.",
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute() {
        return jsonResult(await client.get("/agents"));
      },
    },
    {
      name: "orchestrator_get_agent",
      label: "Orchestrator Get Agent",
      description: "Get details for one agent.",
      parameters: Type.Object({ agentId: Type.String() }, { additionalProperties: false }),
      async execute(_toolCallId: string, params: AgentGet) {
        return jsonResult(await client.get(`/agents/${params.agentId}`));
      },
    },
    {
      name: "orchestrator_list_teams",
      label: "Orchestrator List Teams",
      description: "List all teams.",
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute() {
        return jsonResult(await client.get("/teams"));
      },
    },
    {
      name: "orchestrator_get_team",
      label: "Orchestrator Get Team",
      description: "Get details for one team.",
      parameters: Type.Object({ teamId: Type.String() }, { additionalProperties: false }),
      async execute(_toolCallId: string, params: TeamGet) {
        return jsonResult(await client.get(`/teams/${params.teamId}`));
      },
    },
    {
      name: "orchestrator_create_team",
      label: "Orchestrator Create Team",
      description: "Create a new team.",
      parameters: TeamCreateSchema,
      async execute(_toolCallId: string, params: TeamCreate) {
        return jsonResult(
          await client.post("/teams", {
            name: params.name,
            description: params.description ?? "",
            goal: params.goal,
            theme: params.theme,
          }),
        );
      },
    },
    {
      name: "orchestrator_add_team_member",
      label: "Orchestrator Add Team Member",
      description: "Add an agent to a team.",
      parameters: TeamMemberSchema,
      async execute(_toolCallId: string, params: TeamMemberAdd) {
        return jsonResult(
          await client.post(`/teams/${params.teamId}/members`, {
            agentId: params.agentId,
            role: params.role ?? "member",
          }),
        );
      },
    },
    {
      name: "orchestrator_list_workflows",
      label: "Orchestrator List Workflows",
      description: "List workflows, optionally filtered by teamId.",
      parameters: Type.Object(
        {
          teamId: Type.Optional(Type.String({ description: "Optional team ID filter." })),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: WorkflowQuery) {
        const suffix = params.teamId ? `?teamId=${encodeURIComponent(params.teamId)}` : "";
        return jsonResult(await client.get(`/workflows${suffix}`));
      },
    },
    {
      name: "orchestrator_get_workflow",
      label: "Orchestrator Get Workflow",
      description: "Get workflow details.",
      parameters: Type.Object({ workflowId: Type.String() }, { additionalProperties: false }),
      async execute(_toolCallId: string, params: WorkflowGet) {
        return jsonResult(await client.get(`/workflows/${params.workflowId}`));
      },
    },
    {
      name: "orchestrator_create_workflow",
      label: "Orchestrator Create Workflow",
      description: "Create a workflow.",
      parameters: WorkflowPayloadSchema,
      async execute(_toolCallId: string, params: WorkflowCreate) {
        return jsonResult(
          await client.post("/workflows", {
            teamId: params.teamId,
            name: params.name,
            nodes: params.nodes,
            edges: params.edges,
            schedule: params.schedule,
          }),
        );
      },
    },
    {
      name: "orchestrator_update_workflow",
      label: "Orchestrator Update Workflow",
      description: "Update a workflow.",
      parameters: WorkflowUpdateSchema,
      async execute(_toolCallId: string, params: WorkflowUpdate) {
        return jsonResult(
          await client.put(`/workflows/${params.workflowId}`, {
            name: params.name,
            nodes: params.nodes,
            edges: params.edges,
            schedule: params.schedule,
          }),
        );
      },
    },
    {
      name: "orchestrator_execute_workflow",
      label: "Orchestrator Execute Workflow",
      description: "Execute a workflow immediately.",
      parameters: Type.Object({ workflowId: Type.String() }, { additionalProperties: false }),
      async execute(_toolCallId: string, params: WorkflowExecute) {
        return jsonResult(await client.post(`/workflows/${params.workflowId}/execute`));
      },
    },
    {
      name: "orchestrator_get_execution",
      label: "Orchestrator Get Execution",
      description: "Inspect one workflow execution.",
      parameters: Type.Object({ executionId: Type.String() }, { additionalProperties: false }),
      async execute(_toolCallId: string, params: ExecutionGet) {
        return jsonResult(await client.get(`/executions/${params.executionId}`));
      },
    },
    {
      name: "orchestrator_list_pending_approvals",
      label: "Orchestrator List Pending Approvals",
      description: "List pending approval nodes.",
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute() {
        return jsonResult(await client.get("/approvals/pending"));
      },
    },
    {
      name: "orchestrator_resolve_approval",
      label: "Orchestrator Resolve Approval",
      description: "Approve or reject a pending approval node.",
      parameters: Type.Object(
        {
          approvalId: Type.String({ description: "Approval ID." }),
          action: ApprovalActionSchema,
          rejectReason: Type.Optional(Type.String({ description: "Reason used when rejecting." })),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: ApprovalResolve) {
        if (params.action === "approve") {
          return jsonResult(await client.post(`/approvals/${params.approvalId}/approve`));
        }

        return jsonResult(
          await client.post(`/approvals/${params.approvalId}/reject`, {
            reject_reason: params.rejectReason ?? "",
          }),
        );
      },
    },
    {
      name: "orchestrator_list_sessions",
      label: "Orchestrator List Sessions",
      description: "List sessions for one agent.",
      parameters: Type.Object({ agentId: Type.String() }, { additionalProperties: false }),
      async execute(_toolCallId: string, params: SessionList) {
        return jsonResult(await client.get(`/agents/${params.agentId}/sessions`));
      },
    },
    {
      name: "orchestrator_send_agent_message",
      label: "Orchestrator Send Agent Message",
      description: "Send a message to an agent session. Defaults to the main session.",
      parameters: Type.Object(
        {
          agentId: Type.String({ description: "Target agent ID." }),
          content: Type.String({ description: "Message content." }),
          sessionId: Type.Optional(Type.String({ description: "Optional session ID. Defaults to main." })),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: SendMessage) {
        const sessionId = params.sessionId?.trim() || "main";
        return jsonResult(
          await client.post(`/agents/${params.agentId}/sessions/${encodeURIComponent(sessionId)}/send`, {
            content: params.content,
          }),
        );
      },
    },
    {
      name: "orchestrator_list_knowledge",
      label: "Orchestrator List Knowledge",
      description: "List knowledge items for an agent or team.",
      parameters: KnowledgeListParamsSchema,
      async execute(_toolCallId: string, params: KnowledgeList) {
        return jsonResult(await client.get(scopePath(params.scope, params.targetId)));
      },
    },
    {
      name: "orchestrator_add_knowledge",
      label: "Orchestrator Add Knowledge",
      description: "Add a knowledge item for an agent or team.",
      parameters: KnowledgeAddParamsSchema,
      async execute(_toolCallId: string, params: KnowledgeAdd) {
        return jsonResult(
          await client.post(scopePath(params.scope, params.targetId), {
            sourceType: params.sourceType,
            sourcePath: params.sourcePath,
            title: params.title,
          }),
        );
      },
    },
    {
      name: "orchestrator_search_knowledge",
      label: "Orchestrator Search Knowledge",
      description: "Search knowledge for an agent or team.",
      parameters: KnowledgeSearchParamsSchema,
      async execute(_toolCallId: string, params: KnowledgeSearch) {
        return jsonResult(
          await client.post(`${scopePath(params.scope, params.targetId)}/search`, {
            query: params.query,
          }),
        );
      },
    },
  ];
}
