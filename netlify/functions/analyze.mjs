import {
  errorResponse,
  httpError,
  incrementSessionCall,
  json,
  readJson,
} from "../lib/shared.mjs";

const pageArray = { type: "ARRAY", items: { type: "INTEGER" } };
const stringArray = { type: "ARRAY", items: { type: "STRING" } };

const evidenceItem = {
  type: "OBJECT",
  properties: {
    field: { type: "STRING" },
    value: { type: "STRING" },
    page: { type: "INTEGER" },
    evidence: { type: "STRING" },
  },
  required: ["field", "value", "page", "evidence"],
};

const chunkSchema = {
  type: "OBJECT",
  properties: {
    identification_evidence: { type: "ARRAY", items: evidenceItem },
    positions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" }, vacancies: { type: "STRING" }, education: { type: "STRING" },
          requirements: { type: "STRING" }, workload: { type: "STRING" }, compensation: { type: "STRING" },
          benefits: { type: "STRING" }, registration_fee: { type: "STRING" }, page: { type: "INTEGER" }, evidence: { type: "STRING" },
        },
        required: ["name", "vacancies", "education", "requirements", "workload", "compensation", "benefits", "registration_fee", "page", "evidence"],
      },
    },
    registration_evidence: { type: "ARRAY", items: evidenceItem },
    timeline: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { event: { type: "STRING" }, date: { type: "STRING" }, page: { type: "INTEGER" }, evidence: { type: "STRING" } },
        required: ["event", "date", "page", "evidence"],
      },
    },
    stages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, nature: { type: "STRING" }, details: { type: "STRING" }, page: { type: "INTEGER" }, evidence: { type: "STRING" } },
        required: ["name", "nature", "details", "page", "evidence"],
      },
    },
    objective_tests: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          position: { type: "STRING" }, discipline: { type: "STRING" }, questions: { type: "STRING" },
          weight: { type: "STRING" }, total_points: { type: "STRING" }, minimum_rule: { type: "STRING" },
          page: { type: "INTEGER" }, evidence: { type: "STRING" },
        },
        required: ["position", "discipline", "questions", "weight", "total_points", "minimum_rule", "page", "evidence"],
      },
    },
    approval_criteria: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { rule: { type: "STRING" }, page: { type: "INTEGER" }, evidence: { type: "STRING" } },
        required: ["rule", "page", "evidence"],
      },
    },
    program_topics: {
      type: "ARRAY",
      maxItems: 800,
      items: {
        type: "OBJECT",
        properties: {
          position: { type: "STRING" }, discipline: { type: "STRING" }, topic: { type: "STRING" },
          subtopic: { type: "STRING" }, page: { type: "INTEGER" }, evidence: { type: "STRING" },
        },
        required: ["position", "discipline", "topic", "subtopic", "page", "evidence"],
      },
    },
    attention_points: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { title: { type: "STRING" }, detail: { type: "STRING" }, severity: { type: "STRING" }, page: { type: "INTEGER" }, evidence: { type: "STRING" } },
        required: ["title", "detail", "severity", "page", "evidence"],
      },
    },
    ambiguities: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { item: { type: "STRING" }, reason: { type: "STRING" }, page: { type: "INTEGER" } },
        required: ["item", "reason", "page"],
      },
    },
  },
  required: [
    "identification_evidence", "positions", "registration_evidence", "timeline", "stages",
    "objective_tests", "approval_criteria", "program_topics", "attention_points", "ambiguities",
  ],
};

const reportSchema = {
  type: "OBJECT",
  properties: {
    identification: {
      type: "OBJECT",
      properties: {
        competition_name: { type: "STRING" }, agency: { type: "STRING" }, organizer: { type: "STRING" },
        notice_number: { type: "STRING" }, publication_date: { type: "STRING" }, scope: { type: "STRING" },
        official_link: { type: "STRING" }, source_pages: pageArray,
      },
      required: ["competition_name", "agency", "organizer", "notice_number", "publication_date", "scope", "official_link", "source_pages"],
    },
    executive_summary: { type: "STRING" },
    positions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" }, vacancies: { type: "STRING" }, education: { type: "STRING" },
          requirements: { type: "STRING" }, workload: { type: "STRING" }, compensation: { type: "STRING" },
          benefits: { type: "STRING" }, registration_fee: { type: "STRING" }, source_pages: pageArray,
        },
        required: ["name", "vacancies", "education", "requirements", "workload", "compensation", "benefits", "registration_fee", "source_pages"],
      },
    },
    registration: {
      type: "OBJECT",
      properties: {
        start_date: { type: "STRING" }, end_date: { type: "STRING" }, payment_deadline: { type: "STRING" },
        website: { type: "STRING" }, exemption_period: { type: "STRING" }, special_service: { type: "STRING" }, source_pages: pageArray,
      },
      required: ["start_date", "end_date", "payment_deadline", "website", "exemption_period", "special_service", "source_pages"],
    },
    timeline: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { event: { type: "STRING" }, date: { type: "STRING" }, source_pages: pageArray },
        required: ["event", "date", "source_pages"],
      },
    },
    stages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, nature: { type: "STRING" }, details: { type: "STRING" }, source_pages: pageArray },
        required: ["name", "nature", "details", "source_pages"],
      },
    },
    objective_tests: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          position: { type: "STRING" }, discipline: { type: "STRING" }, questions: { type: "STRING" },
          weight: { type: "STRING" }, total_points: { type: "STRING" }, minimum_rule: { type: "STRING" }, source_pages: pageArray,
        },
        required: ["position", "discipline", "questions", "weight", "total_points", "minimum_rule", "source_pages"],
      },
    },
    approval_criteria: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { rule: { type: "STRING" }, source_pages: pageArray },
        required: ["rule", "source_pages"],
      },
    },
    verticalized_notice: {
      type: "ARRAY",
      maxItems: 1500,
      items: {
        type: "OBJECT",
        properties: {
          number: { type: "INTEGER" }, position: { type: "STRING" }, discipline: { type: "STRING" },
          topic: { type: "STRING" }, subtopic: { type: "STRING" }, source_pages: pageArray,
          priority: { type: "STRING" }, status: { type: "STRING" },
        },
        required: ["number", "position", "discipline", "topic", "subtopic", "source_pages", "priority", "status"],
      },
    },
    attention_points: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { title: { type: "STRING" }, detail: { type: "STRING" }, severity: { type: "STRING" }, source_pages: pageArray },
        required: ["title", "detail", "severity", "source_pages"],
      },
    },
    pending_items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { item: { type: "STRING" }, reason: { type: "STRING" }, source_pages: pageArray },
        required: ["item", "reason", "source_pages"],
      },
    },
    audit: {
      type: "OBJECT",
      properties: {
        overall_confidence: { type: "STRING" }, summary: { type: "STRING" },
        conflicts: stringArray, checks: stringArray,
      },
      required: ["overall_confidence", "summary", "conflicts", "checks"],
    },
  },
  required: [
    "identification", "executive_summary", "positions", "registration", "timeline", "stages",
    "objective_tests", "approval_criteria", "verticalized_notice", "attention_points", "pending_items", "audit",
  ],
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw httpError(503, "A chave da Gemini ainda não foi configurada.", "API_NOT_CONFIGURED");

    const body = await readJson(req, 4_800_000);
    const { sessionId, phase, payload } = body;
    if (!sessionId) throw httpError(401, "Sessão ausente.", "SESSION_REQUIRED");
    if (!["extract", "consolidate", "audit"].includes(phase)) throw httpError(400, "Etapa de análise inválida.", "INVALID_PHASE");
    if (!payload || typeof payload !== "object") throw httpError(400, "Conteúdo da análise ausente.", "PAYLOAD_REQUIRED");

    await incrementSessionCall(sessionId, phase);

    const { prompt, schema, maxOutputTokens } = buildRequest(phase, payload);
    const result = await callGemini({ apiKey, prompt, schema, maxOutputTokens });
    return json({ result });
  } catch (error) {
    if (error?.status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(error?.message || "")) {
      error.status = 429;
      error.code = "FREE_QUOTA_EXHAUSTED";
      error.message = "O limite gratuito da Gemini foi atingido. Nenhuma cobrança será feita.";
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
      schema: chunkSchema,
      maxOutputTokens: 20000,
      prompt: `Você é um analista especialista em editais de concursos públicos brasileiros. Analise SOMENTE as páginas fornecidas abaixo.

REGRAS OBRIGATÓRIAS:
1. Não invente, complete ou deduza informações ausentes.
2. Toda informação deve estar vinculada ao número da PÁGINA DIGITAL indicado no separador.
3. Preserve a associação correta entre cargo, requisito, remuneração, prova e conteúdo programático.
4. Extraia evidência textual curta e fiel para permitir auditoria posterior.
5. Em conteúdo programático, crie um registro por assunto ou subassunto real. Não transforme regras administrativas em matéria de estudo.
6. Quando uma tabela estiver incompleta no texto extraído, registre a ambiguidade em vez de adivinhar.
7. Use "Não informado" nos campos não disponíveis, sem criar dados.
8. Datas devem permanecer exatamente como aparecem no documento.
9. A natureza de cada etapa deve ser "eliminatória", "classificatória", "eliminatória e classificatória" ou "não informada".
10. O campo severity deve ser alta, média ou baixa.

ARQUIVO: ${payload.fileName || "edital.pdf"}
TOTAL DE PÁGINAS DO DOCUMENTO: ${payload.totalPages || "não informado"}

PÁGINAS PARA ANÁLISE:
${pageText}`,
    };
  }

  if (phase === "consolidate") {
    return {
      schema: reportSchema,
      maxOutputTokens: 50000,
      prompt: `Você é o revisor-chefe de uma análise de edital de concurso público. Consolide os extratos de várias partes do mesmo documento em UM relatório coerente.

REGRAS OBRIGATÓRIAS:
1. Elimine duplicações sem perder páginas de origem.
2. Não misture cargos, salários, requisitos, taxas ou estruturas de prova.
3. Se houver divergência entre extratos, não escolha silenciosamente: registre a pendência e o conflito na auditoria.
4. Toda informação relevante deve ter source_pages.
5. Quando não houver prova suficiente, use "Não localizado" ou "Não informado".
6. O edital verticalizado deve conter APENAS conteúdos programáticos de estudo. Um assunto por linha, preservando disciplina, cargo e página.
7. Não atribua prioridade alta/média/baixa por conta própria. Use sempre "A definir", salvo se o documento declarar peso ou importância expressa; mesmo assim, explique apenas no relatório, mantendo a prioridade como "A definir".
8. O status inicial de todos os tópicos é "Não iniciado".
9. Ordene o cronograma cronologicamente quando as datas permitirem.
10. Separe regras gerais das regras específicas de cada cargo.
11. Faça um resumo executivo claro, mas não omita riscos importantes.
12. A confiança geral deve ser alta, média ou baixa, considerando evidências e conflitos.

ARQUIVO: ${payload.fileName || "edital.pdf"}
TOTAL DE PÁGINAS: ${payload.totalPages || "não informado"}

EXTRATOS ESTRUTURADOS:
${JSON.stringify(payload.extracts || [])}`,
    };
  }

  return {
    schema: reportSchema,
    maxOutputTokens: 50000,
    prompt: `Você é um auditor independente de editais de concursos públicos. Revise o relatório consolidado contra os extratos com evidências e devolva o RELATÓRIO COMPLETO CORRIGIDO no mesmo formato.

OBJETIVOS DA AUDITORIA:
1. Remover qualquer informação não sustentada pelos extratos.
2. Corrigir associações entre cargos, vagas, remunerações, requisitos e provas.
3. Unificar páginas de origem sem apagar referências relevantes.
4. Detectar datas conflitantes, anexos ausentes e tabelas parcialmente lidas.
5. Verificar se a verticalização contém somente conteúdos programáticos reais.
6. Separar tópicos compostos quando o edital listar assuntos diferentes, sem inventar subdivisões.
7. Registrar em pending_items tudo que exigir conferência manual.
8. Registrar em audit.conflicts os conflitos encontrados, em frases claras.
9. Registrar em audit.checks as verificações efetivamente realizadas.
10. Use confiança alta somente se os elementos principais tiverem evidência consistente e poucas lacunas.
11. Não inclua explicações fora do JSON.

ARQUIVO: ${payload.fileName || "edital.pdf"}
TOTAL DE PÁGINAS: ${payload.totalPages || "não informado"}

RELATÓRIO A SER AUDITADO:
${JSON.stringify(payload.consolidatedReport || {})}

EXTRATOS COM EVIDÊNCIAS:
${JSON.stringify(payload.extracts || [])}`,
  };
}

async function callGemini({ apiKey, prompt, schema, maxOutputTokens }) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
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
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Falha na Gemini (${response.status}).`;
    const error = httpError(response.status, message, data?.error?.status || "GEMINI_ERROR");
    throw error;
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
