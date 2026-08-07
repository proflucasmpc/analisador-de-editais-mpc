import { createHash, randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

export const REPORT_STORE = "mpc-edital-reports";
export const SESSION_STORE = "mpc-analysis-sessions";
export const USAGE_STORE = "mpc-analysis-usage";

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

export async function readJson(req, maxBytes = 5_000_000) {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw httpError(413, "A solicitação excede o limite permitido.", "PAYLOAD_TOO_LARGE");
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw httpError(413, "A solicitação excede o limite permitido.", "PAYLOAD_TOO_LARGE");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw httpError(400, "JSON inválido.", "INVALID_JSON");
  }
}

export function httpError(status, message, code = "REQUEST_ERROR") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function errorResponse(error) {
  console.error(error);
  return json(
    {
      error: error?.message || "Erro interno.",
      code: error?.code || "INTERNAL_ERROR",
    },
    error?.status || 500,
  );
}

export function clientIp(req) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function hashValue(value) {
  const salt = process.env.RATE_LIMIT_SALT || "mpc-edital-local-salt-change-me";
  return createHash("sha256").update(`${salt}|${value}`).digest("hex");
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function createCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = randomUUID().replaceAll("-", "").toUpperCase();
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    const value = Number.parseInt(raw[i], 16);
    code += alphabet[value % alphabet.length];
  }
  return `MPC-${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function getSession(sessionId) {
  if (!sessionId || typeof sessionId !== "string") {
    throw httpError(401, "Sessão de análise ausente.", "SESSION_REQUIRED");
  }
  const store = getStore({ name: SESSION_STORE, consistency: "strong" });
  const session = await store.get(sessionId, { type: "json", consistency: "strong" });
  if (!session) throw httpError(401, "Sessão de análise inválida.", "SESSION_INVALID");
  if (Date.now() > session.expiresAt) throw httpError(401, "A sessão de análise expirou.", "SESSION_EXPIRED");
  return { store, session };
}

export async function incrementSessionCall(sessionId, phase) {
  const { store, session } = await getSession(sessionId);
  const maxCalls = Number(process.env.MAX_GEMINI_CALLS_PER_ANALYSIS || 26);
  if ((session.calls || 0) >= maxCalls) {
    throw httpError(429, "O limite de chamadas desta análise foi atingido.", "FREE_QUOTA_EXHAUSTED");
  }
  const updated = {
    ...session,
    calls: (session.calls || 0) + 1,
    lastPhase: phase,
    updatedAt: Date.now(),
  };
  await store.setJSON(sessionId, updated);
  return updated;
}
