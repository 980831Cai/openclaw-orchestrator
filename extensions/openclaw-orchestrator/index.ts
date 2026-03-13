import type { OrchestratorPluginApi } from "./src/plugin-sdk-compat.ts";

import { resolveConfig } from "./src/client.ts";
import { ORCHESTRATOR_TOOL_NAMES, createOrchestratorTools } from "./src/tools.ts";

const plugin = {
  id: "openclaw-orchestrator",
  name: "OpenClaw Orchestrator",
  description: "Bridge OpenClaw agents to the external OpenClaw Orchestrator service.",
  register(api: OrchestratorPluginApi) {
    const config = resolveConfig(api.pluginConfig);

    api.registerTool((toolCtx) => createOrchestratorTools(api, config, toolCtx), {
      names: [...ORCHESTRATOR_TOOL_NAMES],
    });

    api.registerService({
      id: plugin.id,
      start(ctx) {
        const target = config.baseUrl ?? "not configured";
        ctx.logger.info(
          `openclaw-orchestrator: registered ${ORCHESTRATOR_TOOL_NAMES.length} bridge tools (baseUrl=${target})`,
        );
      },
    });
  },
};

export default plugin;
