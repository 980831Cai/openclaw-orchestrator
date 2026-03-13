import { Type } from "@sinclair/typebox";

export type OrchestratorPluginApi = {
  pluginConfig?: unknown;
  registerTool: (
    factory: (ctx: OrchestratorPluginToolContext) => unknown,
    options: { names: readonly string[] },
  ) => void;
  registerService: (service: {
    id: string;
    start: (ctx: { logger: { info: (message: string) => void } }) => void;
  }) => void;
};

export type OrchestratorPluginToolContext = {
  agentId?: string;
  sessionKey?: string;
  agentAccountId?: string;
  messageChannel?: string;
};

export type OrchestratorPluginToolResult = {
  content: Array<{
    type: "text";
    text: string;
  }>;
  details: unknown;
};

type StringEnumOptions<T extends readonly string[]> = {
  description?: string;
  title?: string;
  default?: T[number];
};

export function jsonResult(payload: unknown): OrchestratorPluginToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
}

export function stringEnum<T extends readonly string[]>(
  values: T,
  options: StringEnumOptions<T> = {},
) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    ...options,
  });
}

export function optionalStringEnum<T extends readonly string[]>(
  values: T,
  options: StringEnumOptions<T> = {},
) {
  return Type.Optional(stringEnum(values, options));
}
