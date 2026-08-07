import { getStore } from "@netlify/blobs";
import {
  REPORT_STORE,
  errorResponse,
  httpError,
  json,
  readJson,
} from "../lib/shared.mjs";

export default async (req) => {
  try {
    requireAdmin(req);
    const store = getStore({ name: REPORT_STORE, consistency: "strong" });
    const url = new URL(req.url);

    if (req.method === "GET") {
      const action = url.searchParams.get("action") || "get";
      if (action === "list") {
        const { blobs } = await store.list();
        const keys = blobs.map((item) => item.key).slice(-150).reverse();
        const records = [];
        for (const key of keys) {
          const item = await store.get(key, { type: "json", consistency: "strong" });
          if (!item) continue;
          records.push({
            code: item.code,
            competitionName: item.competitionName,
            fileName: item.fileName,
            status: item.status,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          });
        }
        records.sort((a, b) => b.createdAt - a.createdAt);
        return json({ records });
      }

      const code = normalizeCode(url.searchParams.get("code"));
      if (!code) throw httpError(400, "Informe o código da análise.", "CODE_REQUIRED");
      const record = await store.get(code, { type: "json", consistency: "strong" });
      if (!record) throw httpError(404, "Análise não encontrada.", "REPORT_NOT_FOUND");
      return json({ record });
    }

    if (req.method === "POST") {
      const body = await readJson(req, 80_000);
      const code = normalizeCode(body.code);
      const status = String(body.status || "").toLowerCase();
      if (!code) throw httpError(400, "Informe o código da análise.", "CODE_REQUIRED");
      if (!["aguardando", "baixado", "enviado", "concluido"].includes(status)) {
        throw httpError(400, "Status inválido.", "INVALID_STATUS");
      }
      const record = await store.get(code, { type: "json", consistency: "strong" });
      if (!record) throw httpError(404, "Análise não encontrada.", "REPORT_NOT_FOUND");
      const updated = { ...record, status, updatedAt: Date.now() };
      await store.setJSON(code, updated, {
        metadata: {
          status,
          createdAt: record.createdAt,
          competitionName: String(record.competitionName || "").slice(0, 180),
        },
      });
      return json({ record: updated });
    }

    return json({ error: "Método não permitido." }, 405);
  } catch (error) {
    return errorResponse(error);
  }
};

function requireAdmin(req) {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) throw httpError(503, "A senha administrativa ainda não foi configurada.", "ADMIN_NOT_CONFIGURED");
  const supplied = req.headers.get("x-admin-secret") || "";
  if (supplied !== expected) throw httpError(401, "Senha administrativa incorreta.", "ADMIN_UNAUTHORIZED");
}

function normalizeCode(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^MPC-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(text) ? text : "";
}
