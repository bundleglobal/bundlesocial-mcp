import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import { McpToolError } from "./errors";

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") ||
      lower.startsWith("ff")
    );
  }
  return true;
}

// Checks the address the socket actually connects to, so DNS rebinding can't slip past.
const publicOnlyLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 4);
    const list = addresses as dns.LookupAddress[];
    const blocked = list.find((entry) => isPrivateAddress(entry.address));
    if (blocked || list.length === 0) {
      return callback(Object.assign(new Error(`Refusing to fetch ${hostname}: not a public address`), { code: "EPRIVATE" }), "", 4);
    }
    if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export interface FetchPublicOptions {
  maxBytes: number;
  timeoutMs?: number;
}

/** GET a public https:// URL with no redirects, a size cap and a timeout. */
export function fetchPublicHttps(url: string, { maxBytes, timeoutMs = 30_000 }: FetchPublicOptions): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new McpToolError("INVALID_URL", `"${url}" is not a valid URL.`));
  }
  if (parsed.protocol !== "https:") {
    return Promise.reject(new McpToolError("INVALID_URL", `Only https:// URLs are supported, got "${parsed.protocol}".`));
  }
  // Node skips `lookup` for IP-literal hosts, so check those here.
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isPrivateAddress(host)) {
    return Promise.reject(new McpToolError("URL_NOT_PUBLIC", `"${url}" does not point to a public internet address.`));
  }

  return new Promise((resolve, reject) => {
    const request = https.get(parsed, { lookup: publicOnlyLookup, timeout: timeoutMs }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        response.resume();
        return reject(new McpToolError("FETCH_REDIRECT", `"${url}" redirects (HTTP ${status}). Pass the final URL instead.`, { status }));
      }
      if (status < 200 || status >= 300) {
        response.resume();
        return reject(new McpToolError("FETCH_FAILED", `Could not download "${url}" (HTTP ${status}).`, { status }));
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          request.destroy();
          reject(new McpToolError("FILE_TOO_LARGE", `"${url}" is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new McpToolError("FETCH_TIMEOUT", `Downloading "${url}" timed out.`)));
    request.on("error", (error: NodeJS.ErrnoException) => {
      if (error instanceof McpToolError) return reject(error);
      if (error.code === "EPRIVATE") {
        return reject(new McpToolError("URL_NOT_PUBLIC", `"${url}" does not point to a public internet address.`));
      }
      reject(new McpToolError("FETCH_FAILED", `Could not download "${url}": ${error.message}`));
    });
  });
}
