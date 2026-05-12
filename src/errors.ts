import { ApiError } from "bundlesocial";

/** An error with a stable machine-readable `code`, surfaced in the tool error result. */
export class McpToolError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
    this.details = details;
  }
}

export interface NormalizedError {
  code: string;
  message: string;
  details?: unknown;
}

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof McpToolError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof ApiError) {
    const body = error.body as Record<string, unknown> | string | undefined;
    const message =
      (typeof body === "object" && body && typeof body.message === "string" && body.message) ||
      (typeof body === "object" && body && typeof body.error === "string" && body.error) ||
      error.statusText ||
      error.message ||
      `HTTP ${error.status}`;
    return { code: `HTTP_${error.status}`, message, details: { status: error.status, url: error.url, body: error.body } };
  }
  if (error instanceof Error) {
    return {
      code: "UNEXPECTED_ERROR",
      message: error.message || "Unexpected error",
      details: process.env.BUNDLESOCIAL_DEBUG ? { stack: error.stack } : undefined,
    };
  }
  return { code: "UNEXPECTED_ERROR", message: String(error) };
}

export function errorSummary(error: unknown): string {
  if (error instanceof ApiError) return `HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ""}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

type TextContent = { type: "text"; text: string };
export interface ToolResult {
  content: TextContent[];
  isError?: boolean;
}

/** Wrap a value as a successful tool result (pretty JSON in a text block). */
export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Wrap an error as a tool error result with the `{ error: { code, message, details? } }` envelope. */
export function errorResult(error: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: normalizeError(error) }, null, 2) }], isError: true };
}
