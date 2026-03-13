export type OrchestratorPluginConfig = {
  baseUrl?: string;
  authToken?: string;
  timeoutMs?: number;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_BASE_URL = "http://127.0.0.1:3721";

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeTimeout(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function trimTrailingSlash(input: string): string {
  return input.replace(/\/+$/, "");
}

function buildApiBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined;
  const trimmed = trimTrailingSlash(baseUrl);
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function readEnv(name: string): string | undefined {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>;
    };
  };

  return maybeProcess.process?.env?.[name];
}

export function resolveConfig(raw: unknown): OrchestratorPluginConfig {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  return {
    baseUrl:
      normalizeString(readEnv("OPENCLAW_ORCHESTRATOR_BASE_URL")) ??
      normalizeString(value.baseUrl) ??
      DEFAULT_BASE_URL,
    authToken:
      normalizeString(readEnv("OPENCLAW_ORCHESTRATOR_AUTH_TOKEN")) ?? normalizeString(value.authToken),
    timeoutMs:
      normalizeTimeout(Number(readEnv("OPENCLAW_ORCHESTRATOR_TIMEOUT_MS"))) ??
      normalizeTimeout(value.timeoutMs) ??
      DEFAULT_TIMEOUT_MS,
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload.trim();

  if (payload && typeof payload === "object") {
    const detail = (payload as Record<string, unknown>).detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();

    if (detail && typeof detail === "object") {
      const nestedMessage = (detail as Record<string, unknown>).message;
      if (typeof nestedMessage === "string" && nestedMessage.trim()) return nestedMessage.trim();
    }

    const message = (payload as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message.trim();

    const error = (payload as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim()) return error.trim();
  }

  return fallback;
}

export function createOrchestratorClient(config: OrchestratorPluginConfig) {
  const apiBaseUrl = buildApiBaseUrl(config.baseUrl);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!apiBaseUrl) {
      throw new Error("OpenClaw Orchestrator baseUrl is not configured.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(
          `Orchestrator API ${response.status} ${response.statusText}: ${extractErrorMessage(
            payload,
            "Request failed",
          )}`,
        );
      }

      return payload as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Orchestrator API request timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    config: {
      baseUrl: config.baseUrl,
      apiBaseUrl,
      hasAuthToken: Boolean(config.authToken),
      timeoutMs,
    },
    request,
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
    put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
    delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
    health: () => request<Record<string, unknown>>("/health"),
  };
}
