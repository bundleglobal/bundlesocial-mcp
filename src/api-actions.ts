import type { Bundlesocial } from "bundlesocial";
import { API_ACTIONS, type ApiAction } from "./generated/api-actions";
import { McpToolError } from "./errors";

export { API_ACTIONS, type ApiAction };

/** Actions whose summary, id, path or description contain every word of the query (case-insensitive). */
export function searchApiActions(query?: string, filter: { readOnly?: boolean } = {}): ApiAction[] {
  const words = (query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return API_ACTIONS.filter((action) => {
    if (filter.readOnly !== undefined && action.readOnly !== filter.readOnly) return false;
    const haystack = `${action.id} ${action.http} ${action.summary} ${action.description}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function findApiAction(id: string): ApiAction {
  const action = API_ACTIONS.find((candidate) => candidate.id === id.trim());
  if (!action) {
    throw new McpToolError("UNKNOWN_ACTION", `No API action "${id}". Search for one with search_api_actions.`);
  }
  return action;
}

/**
 * Call one API action through the SDK. `params` is flat: path/query fields and body fields side by side.
 * `resolveTeam` turns a team id or name (or nothing) into an id for actions that take `teamId`.
 */
export async function runApiAction(
  client: Bundlesocial,
  action: ApiAction,
  input: Record<string, unknown>,
  resolveTeam: (teamIdOrName?: string) => Promise<string>,
): Promise<unknown> {
  const params = { ...input };
  const fields = [...action.params, ...action.body];
  const teamField = fields.find((field) => field.name === "teamId");
  const givenTeam = typeof params.teamId === "string" ? params.teamId : undefined;
  // An optional teamId is a filter: fill it only when given, so the action isn't silently narrowed.
  if (teamField && (givenTeam || teamField.required)) params.teamId = await resolveTeam(givenTeam);

  const missing = fields.filter((field) => field.required && field.name !== "*" && params[field.name] === undefined);
  if (missing.length) {
    throw new McpToolError(
      "INVALID_PARAMS",
      `Action "${action.id}" needs ${missing.map((field) => field.name).join(", ")}.`,
      { required: missing.map(({ name, type, doc }) => ({ name, type, doc })) },
    );
  }

  const data: Record<string, unknown> = {};
  const topLevel = new Set(action.params.map((field) => field.name));
  const bodyNames = new Set(action.body.map((field) => field.name));
  const freeFormBody = bodyNames.has("*");
  const requestBody: Record<string, unknown> = {};
  const unknown: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (topLevel.has(key)) data[key] = value;
    else if (bodyNames.has(key) || freeFormBody) requestBody[key] = value;
    else unknown.push(key);
  }
  if (unknown.length) {
    throw new McpToolError("INVALID_PARAMS", `Action "${action.id}" does not take ${unknown.join(", ")}.`, {
      accepted: fields.map((field) => field.name),
    });
  }
  if (action.body.length) data.requestBody = requestBody;

  const [service, method] = action.sdk;
  const target = (client as unknown as Record<string, Record<string, (data?: unknown) => Promise<unknown>>>)[service];
  const fn = target?.[method];
  if (typeof fn !== "function") {
    throw new McpToolError("UNKNOWN_ACTION", `The installed SDK has no ${service}.${method}.`);
  }
  return fields.length || action.body.length ? fn.call(target, data) : fn.call(target);
}

/** Compact listing entry; full field schemas only when asked for. */
export function describeApiAction(action: ApiAction, detailed: boolean) {
  const base = { id: action.id, http: action.http, readOnly: action.readOnly, summary: action.summary };
  if (!detailed) return base;
  return {
    ...base,
    description: action.description || undefined,
    params: [...action.params, ...action.body.filter((field) => field.name !== "*")].map(({ name, required, type, doc }) => ({
      name,
      required,
      type,
      ...(doc ? { doc } : {}),
    })),
    ...(action.body.some((field) => field.name === "*") ? { freeFormBody: true } : {}),
  };
}
