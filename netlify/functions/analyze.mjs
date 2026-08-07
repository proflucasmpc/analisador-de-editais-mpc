import {
  errorResponse,
  httpError,
  incrementSessionCall,
  json,
  readJson,
} from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw httpError(503, "A chave da Gemini ainda não foi configurada.", "API_NOT_CONFIGURED");

    const body = await readJson(req, 4_800_000);
    const { sessionId, phase, payload } = body;
    if (!sessionId) throw httpError(401, "Sessão ausente.", "SESSION_REQUIRED");
    if (!["extract", "consolidate", "audit"].includes(phase)) {
      throw httpError(400, "Etapa de análise inválida.", "INVALID_PHASE");
    }
    if (!payload || typeof payload !== "object") {
      throw httpError(400, "Conteúdo da análise ausente.", "PAYLOAD_REQUIRED");
    }

    await incrementSessionCall(sessionId, phase);
    const { prompt, maxOutputTokens, thinkingLevel } = buildRequest(phase, payload);
    const result = await callGemini({ apiKey, prompt, maxOutputTokens, thinkingLevel });
    return json({ result });
  } catch (error) {
    if (error?.status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(error?.message || "")) {
      error.status = 429;
      error.code = "FREE_QUOTA_EXHAUSTED";
      error.message = "A cota gratuita da inteligência artificial está temporariamente esgotada. Nenhuma cobrança será feita.";
    }
    if (error?.status === 504 || /timeout|timed out|deadline/i.test(error?.message || "")) {
      error.status = 504;
      error.code = "AI_TIMEOUT";
      error.message = "A inteligência artificial demorou mais do que o limite desta etapa. Tente novamente; o processamento foi ajustado para blocos menores e respostas mais rápidas.";
    }
    return errorResponse(error);
  }
};

function buildRequest(phase, payload) {
  if (phase === "extract") {
    const pageText = (payload.pages || [])
      .map((item) => `\n===== PÁGINA DIGITAL ${item.page} | MÉTODO ${item.method || "text"} =====\n${item.text || "[SEM TEXTO RECONHECÍVEL]"}`)
      .join("\n");

    return {
      maxOutputTokens: 7000,
      thinkingLevel: "minimal",
      prompt: `Analise SOMENTE estas páginas de um edital de concurso público brasileiro e devolva APENAS JSON válido, sem markdown.

O JSON deve ter exatamente estas chaves de nível superior:
identification_evidence, positions, registration_evidence, timeline, stages, objective_tests, approval_criteria, program_topics, attention_points, ambiguities.

REGRAS:
- Não invente, complete ou deduza informação ausente.
- Toda informação deve registrar a página digital e uma evidência textual curta.
- Preserve a associação correta entre cargo, vagas, remuneração, requisito, prova e conteúdo.
- Se uma tabela estiver incompleta, registre em ambiguities em vez de adivinhar.
- program_topics deve conter somente conteúdo programático de estudo, nunca regras administrativas.
- Datas devem permanecer como aparecem no edital.
- Use "Não informado" quando necessário.
- Seja objetivo: evidências devem ser curtas, sem reproduzir parágrafos inteiros.

FORMATO DOS REGISTROS:
identification_evidence: [{field,value,page,evidence}]
positions: [{name,vacancies,education,requirements,workload,compensation,benefits,registration_fee,page,evidence}]
registration_evidence: [{field,value,page,evidence}]
timeline: [{event,date,page,evidence}]
stages: [{name,nature,details,page,evidence}]
objective_tests: [{position,discipline,questions,weight,total_points,minimum_rule,page,evidence}]
approval_criteria: [{rule,page,evidence}]
program_topics: [{position,discipline,topic,subtopic,page,evidence}]
attention_points: [{title,detail,severity,page,evidence}]
ambiguities: [{item,reason,page}]

ARQUIVO: ${payload.fileName || "edital.pdf"}
TOTAL DE PÁGINAS: ${payload.totalPages || "não informado"}
${pageText}`,
    };
  }

  if (phase === "consolidate") {
    return {
      maxOutputTokens: 14000,
      thinkingLevel: "low",
      prompt: `Consolide os extratos deste edital em um relatório único e devolva APENAS JSON válido, sem markdown.

O JSON deve ter exatamente estas chaves de nível superior:
identification, executive_summary, positions, registration, timeline, stages, objective_tests, approval_criteria, verticalized_notice, attention_points, pending_items, audit.

REGRAS:
- Elimine duplicações, preservando páginas de origem.
- Não misture dados de cargos diferentes.
- Conflitos nunca devem ser resolvidos por suposição: registre-os em pending_items e audit.conflicts.
- verticalized_notice deve conter SOMENTE conteúdos programáticos reais, um assunto/subassunto por linha.
- priority = "A definir" e status = "Não iniciado".
- Use "Não localizado" ou "Não informado" quando faltar prova.
- Seja compacto nas descrições para reduzir tempo de processamento, sem omitir dados objetivos.

FORMATO DOS CAMPOS:
identification {competition_name,agency,organizer,notice_number,publication_date,scope,official_link,source_pages}
executive_summary string
positions [{name,vacancies,education,requirements,workload,compensation,benefits,registration_fee,source_pages}]
registration {start_date,end_date,payment_deadline,website,exemption_period,special_service,source_pages}
timeline [{event,date,source_pages}]
stages [{name,nature,details,source_pages}]
objective_tests [{position,discipline,questions,weight,total_points,minimum_rule,source_pages}]
approval_criteria [{rule,source_pages}]
verticalized_notice [{number,position,discipline,topic,subtopic,source_pages,priority,status}]
attention_points [{title,detail,severity,source_pages}]
pending_items [{item,reason,source_pages}]
audit {overall_confidence,summary,conflicts,checks}

ARQUIVO: ${payload.fileName || "edital.pdf"}
TOTAL DE PÁGINAS: ${payload.totalPages || "não informado"}
EXTRATOS:
${JSON.stringify(payload.extracts || [])}`,
    };
  }

  return {
    maxOutputTokens: 14000,
    thinkingLevel: "low",
    prompt: `Audite o relatório consolidado contra os extratos e devolva APENAS o RELATÓRIO COMPLETO CORRIGIDO em JSON válido, sem markdown, usando exatamente as mesmas chaves de nível superior do relatório recebido.

REGRAS:
- Remova qualquer informação sem sustentação nos extratos.
- Corrija associações entre cargos, vagas, salários, requisitos e provas.
- Verifique datas conflitantes, anexos ausentes e tabelas parcialmente lidas.
- Garanta que verticalized_notice contenha somente conteúdos programáticos reais.
- Tudo que exigir conferência manual deve ir para pending_items.
- audit.conflicts deve registrar conflitos e audit.checks as verificações realizadas.
- Confiança alta somente com evidência consistente e poucas lacunas.
- Seja compacto: não reescreva explicações desnecessariamente longas.

ARQUIVO: ${payload.fileName || "edital.pdf"}
TOTAL DE PÁGINAS: ${payload.totalPages || "não informado"}
RELATÓRIO:
${JSON.stringify(payload.consolidatedReport || {})}
EXTRATOS:
${JSON.stringify(payload.extracts || [])}`,
  };
}

async function callGemini({ apiKey, prompt, maxOutputTokens, thinkingLevel }) {
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 52_000);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "Responda em português do Brasil. Priorize fidelidade documental, rastreabilidade por página e ausência de alucinações." }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens,
          temperature: 0.1,
          responseMimeType: "application/json",
          thinkingConfig: {
            thinkingLevel,
          },
        },
      }),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw httpError(504, "Tempo máximo da etapa excedido.", "AI_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Falha na Gemini (${response.status}).`;
    throw httpError(response.status, message, data?.error?.status || "GEMINI_ERROR");
  }

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) throw httpError(502, "A Gemini não retornou conteúdo utilizável.", "EMPTY_AI_RESPONSE");

  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      throw httpError(502, "A resposta da IA não pôde ser interpretada como JSON.", "INVALID_AI_JSON");
    }
  }
}
