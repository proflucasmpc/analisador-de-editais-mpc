import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";
import {
  SESSION_STORE,
  USAGE_STORE,
  clientIp,
  errorResponse,
  hashValue,
  httpError,
  json,
  readJson,
  todayKey,
} from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const body = await readJson(req, 60_000);
    const { fingerprint, pageCount, charCount } = body;
    if (!fingerprint || typeof fingerprint !== "string") throw httpError(400, "Identificação do arquivo ausente.", "FINGERPRINT_REQUIRED");
    if (!Number.isFinite(Number(pageCount)) || Number(pageCount) < 1) throw httpError(400, "Quantidade de páginas inválida.");
    if (!Number.isFinite(Number(charCount)) || Number(charCount) < 200) throw httpError(400, "O edital possui pouco texto reconhecível.");

    const ipHash = hashValue(clientIp(req));
    const date = todayKey();
    const usageKey = `${date}/${ipHash}`;
    const usageStore = getStore({ name: USAGE_STORE, consistency: "strong" });
    const usage = (await usageStore.get(usageKey, { type: "json", consistency: "strong" })) || { count: 0 };
    const dailyLimit = Number(process.env.DAILY_ANALYSES_PER_IP || 2);

    if (usage.count >= dailyLimit) {
      throw httpError(429, "O limite gratuito de análises deste dispositivo foi atingido hoje.", "FREE_QUOTA_EXHAUSTED");
    }

    await usageStore.setJSON(usageKey, {
      count: usage.count + 1,
      lastAt: Date.now(),
      fingerprints: [...new Set([...(usage.fingerprints || []), fingerprint])].slice(-10),
    });

    const sessionId = randomUUID();
    const now = Date.now();
    const sessionStore = getStore({ name: SESSION_STORE, consistency: "strong" });
    await sessionStore.setJSON(sessionId, {
      fingerprint,
      pageCount: Number(pageCount),
      charCount: Number(charCount),
      calls: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 45 * 60 * 1000,
      ipHash,
    });

    return json({ sessionId, dailyRemaining: Math.max(0, dailyLimit - usage.count - 1) });
  } catch (error) {
    return errorResponse(error);
  }
};
