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
    let result = await callGemini({ apiKey, prompt, maxOutputTokens, thinkingLevel });

    if (phase === "audit") {
      result = finalizeReport(result, payload);
    }

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
      maxOutputTokens: 9000,
      thinkingLevel: "minimal",
      prompt: `Analise SOMENTE estas páginas de um edital de concurso público brasileiro e devolva APENAS JSON válido, sem markdown.

OBJETIVO: extração documental fiel. Não resuma o conteúdo programático e não transforme ausência de localização em ausência no edital.

O JSON deve ter exatamente estas chaves de nível superior:
identification_evidence, positions, registration_evidence, timeline, stages, objective_tests, exam_overview_evidence, approval_criteria, program_topics, attention_points, ambiguities.

REGRAS OBRIGATÓRIAS:
- Não invente, complete ou deduza informação ausente.
- Toda informação deve registrar a página digital exata e uma evidência textual curta.
- Nunca herde a página de outro dado. A página deve conter diretamente a informação exibida.
- Preserve a associação correta entre cargo, vagas, remuneração, requisito, prova e conteúdo.
- Diferencie requisitos de INSCRIÇÃO de condições/requisitos para POSSE, nomeação ou etapas posteriores.
- Capture condições especiais de prova, acessibilidade, atendimento especial, lactação/amamentação e regras equivalentes quando existirem.
- Capture regras de cotas, reserva/não reserva de vagas, pontuação diferenciada, heteroidentificação ou ações afirmativas quando existirem.
- Capture duração da prova, período/turno de aplicação, pontuação total, valor por questão, notas mínimas, redação/dissertativa e limites de linhas quando existirem.
- Se uma tabela estiver incompleta, registre em ambiguities em vez de adivinhar.
- Use "Não informado" SOMENTE quando o trecho declara a ausência ou quando o campo é indispensável ao registro e não consta nas páginas deste bloco. Não conclua que o edital inteiro não informa algo apenas porque este bloco não informa.
- Datas devem permanecer completas como aparecem no edital. Se houver dia/mês/ano, nunca reduza para apenas o ano.
- Evidências devem ser curtas, sem reproduzir parágrafos inteiros.

VERTICALIZAÇÃO — REGRA CRÍTICA:
- program_topics deve conter SOMENTE conteúdo programático de estudo.
- Preserve 100% do texto útil de cada item/subitem do conteúdo programático. NÃO RESUMA listas internas.
- Se um item disser, por exemplo, "Word: cabeçalhos, parágrafos, fontes, colunas, tabelas...", todos os componentes devem continuar no registro.
- Preserve hierarquia de Título > Capítulo > Seção > assunto quando o edital a trouxer.
- Crie um registro por item numerado de menor nível quando houver numeração; quando houver apenas uma lista dentro do item, mantenha a lista completa em subtopic/details.

FORMATO DOS REGISTROS:
identification_evidence: [{field,value,page,evidence}]
positions: [{name,vacancies,education,registration_requirements,possession_requirements,other_conditions,workload,compensation,benefits,registration_fee,page,evidence}]
registration_evidence: [{field,value,page,evidence}]
timeline: [{event,date,page,evidence}]
stages: [{name,nature,details,page,evidence}]
objective_tests: [{position,discipline,questions,weight,total_points,minimum_rule,page,evidence}]
exam_overview_evidence: [{field,value,page,evidence}]
approval_criteria: [{rule,page,evidence}]
program_topics: [{position,discipline,topic,subtopic,details,page,evidence}]
attention_points: [{title,detail,severity,page,evidence}]
ambiguities: [{item,reason,page}]

Campos recomendados em identification_evidence.field: competition_name, agency, organizer, notice_number, publication_date, scope, official_link.
Campos recomendados em registration_evidence.field: start_date, end_date, payment_deadline, website, exemption_period, special_service, lactation.
Campos recomendados em exam_overview_evidence.field: duration, application_period, objective_total_points, question_value, objective_minimum, essay_total_points, essay_minimum, essay_max_lines, simultaneous_application.

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
identification, executive_summary, positions, registration, timeline, stages, objective_tests, exam_overview, approval_criteria, verticalized_notice, attention_points, pending_items, audit.

REGRAS:
- Elimine duplicações sem perder detalhes e preserve páginas de origem.
- Não misture dados de cargos diferentes.
- Diferencie claramente requisitos de inscrição de condições/requisitos de posse.
- Uma informação só pode receber a página que realmente a sustenta. Não use uma página genérica para todas as colunas.
- Conflitos nunca devem ser resolvidos por suposição: registre-os em pending_items e audit.conflicts.
- Nunca converta "não apareceu neste extrato" em "não informado no edital". Se os extratos não permitem concluir, use "Não localizado na análise" e registre a pendência quando relevante.
- Datas completas devem permanecer completas.
- Coloque em attention_points regras de alto impacto para o candidato, inclusive atendimento especial, lactação, ações afirmativas/pontuação diferenciada, reserva ou ausência de reserva de vagas, documentos, horários, eliminação e prazos críticos quando presentes.
- exam_overview deve consolidar duração/turno, pontuação total, mínimos, redação e demais regras gerais da prova.

VERTICALIZAÇÃO — REGRA CRÍTICA:
- verticalized_notice deve conter SOMENTE conteúdos programáticos reais.
- Não resuma nenhum item do conteúdo programático.
- Preserve TODAS as listas internas, capítulos, seções, softwares, recursos, leis e recortes normativos presentes nos extratos.
- Se houver um item numerado de menor nível, ele deve aparecer. Se houver lista não numerada dentro de um item, mantenha a lista completa em details/subtopic.
- Não crie priority ou status; esses campos não pertencem ao edital.

FORMATO DOS CAMPOS:
identification {competition_name,agency,organizer,notice_number,publication_date,scope,official_link,source_pages,source_by_field}
source_by_field é objeto com arrays de páginas para cada campo acima.
executive_summary string
positions [{name,vacancies,education,registration_requirements,possession_requirements,other_conditions,requirements,workload,compensation,benefits,registration_fee,source_pages,source_by_field}]
registration {start_date,end_date,payment_deadline,website,exemption_period,special_service,lactation,source_pages,source_by_field}
timeline [{event,date,source_pages}]
stages [{name,nature,details,source_pages}]
objective_tests [{position,discipline,questions,weight,total_points,minimum_rule,source_pages}]
exam_overview {duration,application_period,objective_total_points,question_value,objective_minimum,essay_total_points,essay_minimum,essay_max_lines,simultaneous_application,source_pages,source_by_field}
approval_criteria [{rule,source_pages}]
verticalized_notice [{number,position,discipline,topic,subtopic,details,source_pages}]
attention_points [{title,detail,severity,source_pages}]
pending_items [{item,reason,source_pages}]
audit {overall_confidence,summary,conflicts,checks,metrics}
metrics {program_coverage,dates_verified,requirements_verified,page_references_verified,not_informed_count,possible_omissions}

ARQUIVO: ${payload.fileName || "edital.pdf"}
TOTAL DE PÁGINAS: ${payload.totalPages || "não informado"}
EXTRATOS:
${JSON.stringify(payload.extracts || [])}`,
    };
  }

  return {
    maxOutputTokens: 14000,
    thinkingLevel: "low",
    prompt: `Audite o relatório consolidado contra TODOS os extratos e devolva APENAS o RELATÓRIO COMPLETO CORRIGIDO em JSON válido, sem markdown, usando exatamente as mesmas chaves de nível superior do relatório recebido.

A auditoria não é decorativa. Ela deve procurar omissões e reduzir a confiança quando houver lacunas.

REGRAS:
- Remova qualquer informação sem sustentação nos extratos.
- Corrija associações entre cargos, vagas, salários, requisitos, provas e páginas.
- Reponha informações objetivas presentes nos extratos que tenham sido omitidas na consolidação.
- Verifique especialmente: data completa de publicação; inscrição x posse; atendimento/condição especial; lactação; duração/turno da prova; pontuação e mínimos; ações afirmativas/pontuação diferenciada; reserva/não reserva de vagas; prazos e regras de eliminação.
- Verifique datas conflitantes, anexos ausentes e tabelas parcialmente lidas.
- verticalized_notice deve preservar 100% dos itens/subitens do conteúdo programático extraído. NÃO RESUMA.
- Compare program_topics dos extratos com verticalized_notice. Se houver qualquer item de estudo extraído que não esteja no relatório, inclua-o.
- Tudo que exigir conferência manual deve ir para pending_items.
- audit.conflicts deve registrar conflitos e audit.checks as verificações realizadas.
- Confiança "Alta" somente se não houver omissão crítica, referências de página estiverem consistentes e cobertura do conteúdo programático for praticamente integral.
- Não afirme "Não informado" quando os extratos simplesmente não localizaram a informação; prefira "Não localizado na análise".

ARQUIVO: ${payload.fileName || "edital.pdf"}
TOTAL DE PÁGINAS: ${payload.totalPages || "não informado"}
RELATÓRIO:
${JSON.stringify(payload.consolidatedReport || {})}
EXTRATOS:
${JSON.stringify(payload.extracts || [])}`,
  };
}

function finalizeReport(rawReport, payload) {
  const report = rawReport && typeof rawReport === "object" ? structuredCloneSafe(rawReport) : {};
  const extracts = Array.isArray(payload.extracts) ? payload.extracts : [];

  const mergedProgram = mergeProgramTopics(extracts);
  const currentProgram = Array.isArray(report.verticalized_notice) ? report.verticalized_notice : [];
  if (mergedProgram.length >= currentProgram.length) {
    report.verticalized_notice = mergedProgram.map((item, index) => ({ ...item, number: index + 1 }));
  }

  report.identification = report.identification && typeof report.identification === "object" ? report.identification : {};
  const publicationCandidates = collectEvidence(extracts, "identification_evidence", "publication_date");
  const bestPublication = mostSpecificDate(publicationCandidates.map((item) => item.value));
  if (bestPublication && dateSpecificity(bestPublication) > dateSpecificity(report.identification.publication_date)) {
    report.identification.publication_date = bestPublication;
    report.identification.source_by_field = report.identification.source_by_field || {};
    report.identification.source_by_field.publication_date = uniquePages(publicationCandidates.filter((item) => item.value === bestPublication).map((item) => item.page));
  }

  report.audit = report.audit && typeof report.audit === "object" ? report.audit : {};
  const metrics = calculateMetrics(report, extracts, mergedProgram);
  report.audit.metrics = metrics;
  report.audit.checks = Array.isArray(report.audit.checks) ? report.audit.checks : [];
  const deterministicChecks = [
    `Cobertura do conteúdo programático: ${metrics.program_coverage}`,
    `Datas com referência: ${metrics.dates_verified}`,
    `Referências de página: ${metrics.page_references_verified}`,
  ];
  report.audit.checks = [...new Set([...report.audit.checks, ...deterministicChecks])];

  const coverageNumber = Number.parseFloat(String(metrics.program_coverage).replace("%", ""));
  if ((Number.isFinite(coverageNumber) && coverageNumber < 98) || metrics.possible_omissions > 0 || metrics.page_references_verified !== "100%") {
    if (String(report.audit.overall_confidence || "").toLowerCase() === "alta") {
      report.audit.overall_confidence = "Média";
    }
  }

  return report;
}

function mergeProgramTopics(extracts) {
  const items = [];
  for (const extract of extracts) {
    for (const item of Array.isArray(extract?.program_topics) ? extract.program_topics : []) {
      if (!item || typeof item !== "object") continue;
      const position = clean(item.position || "Todos");
      const discipline = clean(item.discipline || "Não identificada");
      const topic = clean(item.topic || "");
      const subtopic = clean(item.subtopic || "");
      const details = clean(item.details || "");
      const page = Number.parseInt(item.page, 10);
      if (!topic && !subtopic && !details) continue;
      items.push({
        position,
        discipline,
        topic: topic || subtopic || details,
        subtopic,
        details,
        source_pages: Number.isFinite(page) ? [page] : [],
      });
    }
  }

  const seen = new Set();
  return items.filter((item) => {
    const key = [item.position, item.discipline, item.topic, item.subtopic, item.details, item.source_pages.join(",")]
      .map((value) => clean(value).toLowerCase())
      .join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function calculateMetrics(report, extracts, mergedProgram) {
  const finalProgram = Array.isArray(report.verticalized_notice) ? report.verticalized_notice : [];
  const sourceCount = mergedProgram.length;
  const finalCount = finalProgram.length;
  const programCoverage = sourceCount ? Math.min(100, Math.round((finalCount / sourceCount) * 100)) : 100;

  const timeline = Array.isArray(report.timeline) ? report.timeline : [];
  const datesWithPages = timeline.filter((item) => uniquePages(item?.source_pages).length).length;

  const pageBearingCollections = [
    report.positions,
    report.timeline,
    report.stages,
    report.objective_tests,
    report.approval_criteria,
    report.verticalized_notice,
    report.attention_points,
    report.pending_items,
  ].filter(Array.isArray).flat();
  const pageReferenced = pageBearingCollections.filter((item) => uniquePages(item?.source_pages).length).length;
  const pagePercent = pageBearingCollections.length ? Math.round((pageReferenced / pageBearingCollections.length) * 100) : 100;

  const positions = Array.isArray(report.positions) ? report.positions : [];
  let reqTotal = 0;
  let reqWithPages = 0;
  for (const item of positions) {
    for (const field of ["education", "registration_requirements", "possession_requirements", "other_conditions"]) {
      const value = clean(item?.[field]);
      if (!value || /não (informado|localizado)/i.test(value)) continue;
      reqTotal += 1;
      const fieldPages = item?.source_by_field?.[field] || item?.source_pages;
      if (uniquePages(fieldPages).length) reqWithPages += 1;
    }
  }

  return {
    program_coverage: `${programCoverage}%`,
    dates_verified: timeline.length ? `${datesWithPages}/${timeline.length}` : "0/0",
    requirements_verified: reqTotal ? `${reqWithPages}/${reqTotal}` : "0/0",
    page_references_verified: `${pagePercent}%`,
    not_informed_count: countNotLocated(report),
    possible_omissions: Math.max(0, sourceCount - finalCount),
  };
}

function countNotLocated(value) {
  if (typeof value === "string") return /não (informado|localizado)/i.test(value) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countNotLocated(item), 0);
  if (value && typeof value === "object") return Object.values(value).reduce((sum, item) => sum + countNotLocated(item), 0);
  return 0;
}

function collectEvidence(extracts, key, field) {
  const output = [];
  for (const extract of extracts) {
    for (const item of Array.isArray(extract?.[key]) ? extract[key] : []) {
      if (clean(item?.field).toLowerCase() === field.toLowerCase()) output.push(item);
    }
  }
  return output;
}

function mostSpecificDate(values) {
  return values.map(clean).filter(Boolean).sort((a, b) => dateSpecificity(b) - dateSpecificity(a))[0] || "";
}

function dateSpecificity(value) {
  const text = clean(value);
  if (!text) return 0;
  if (/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}\b/.test(text)) return 4;
  if (/\b\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4}\b/i.test(text)) return 4;
  if (/\b\d{1,2}[\/.-]\d{1,2}\b/.test(text)) return 3;
  if (/\b(19|20)\d{2}\b/.test(text)) return 1;
  return 2;
}

function uniquePages(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(source.map((item) => Number.parseInt(item, 10)).filter(Number.isFinite))].sort((a, b) => a - b);
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function structuredCloneSafe(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

async function callGemini({ apiKey, prompt, maxOutputTokens, thinkingLevel }) {
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
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
          parts: [{ text: "Responda em português do Brasil. Priorize fidelidade documental, rastreabilidade por página, cobertura integral e ausência de alucinações." }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens,
          temperature: 0.05,
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
