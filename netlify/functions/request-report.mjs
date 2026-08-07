import { getStore } from "@netlify/blobs";
import {
  REPORT_STORE,
  clientIp,
  createCode,
  errorResponse,
  hashValue,
  httpError,
  json,
  readJson,
} from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const body = await readJson(req, 4_900_000);
    const { fingerprint, fileName, report } = body;
    if (!report || typeof report !== "object") throw httpError(400, "Relatório ausente.", "REPORT_REQUIRED");
    if (!fingerprint || typeof fingerprint !== "string") throw httpError(400, "Identificação da análise ausente.", "FINGERPRINT_REQUIRED");

    const store = getStore({ name: REPORT_STORE, consistency: "strong" });
    let code = createCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await store.get(code, { type: "json", consistency: "strong" });
      if (!existing) break;
      code = createCode();
    }

    const now = Date.now();
    await store.setJSON(code, {
      code,
      fingerprint,
      fileName: String(fileName || "edital.pdf").slice(0, 240),
      competitionName: String(report?.identification?.competition_name || "Concurso não identificado").slice(0, 300),
      status: "aguardando",
      createdAt: now,
      updatedAt: now,
      requesterHash: hashValue(clientIp(req)),
      report,
    }, {
      metadata: {
        status: "aguardando",
        createdAt: now,
        competitionName: String(report?.identification?.competition_name || "Concurso não identificado").slice(0, 180),
      },
      onlyIfNew: true,
    });

    return json({ code, status: "aguardando" });
  } catch (error) {
    return errorResponse(error);
  }
};
