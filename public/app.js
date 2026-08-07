(() => {
  "use strict";

  const CONFIG = window.MPC_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const state = {
    file: null,
    fingerprint: null,
    pages: [],
    sessionId: null,
    report: null,
    requestCode: null,
    busy: false,
  };

  const SECTION_LABELS = {
    identification: "Identificação",
    executive: "Resumo executivo",
    positions: "Cargos e vagas",
    registration: "Inscrições",
    timeline: "Cronograma",
    stages: "Etapas",
    tests: "Estrutura das provas",
    criteria: "Critérios de aprovação",
    verticalized: "Edital verticalizado",
    attention: "Pontos de atenção",
    pending: "Pendências",
    audit: "Auditoria",
  };

  initialize();

  function initialize() {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    $("headerToolName").textContent = CONFIG.toolName;
    $("footerToolName").textContent = CONFIG.toolName;
    $("headerMentorship").href = CONFIG.mentorshipUrl || "#";
    $("sideMentorship").href = CONFIG.mentorshipUrl || "#";
    $("uploadLimit").textContent = `PDF de até ${CONFIG.maxFileSizeMB || 35} MB e ${CONFIG.maxPages || 350} páginas`;
    $("privacyText").textContent = CONFIG.privacyText || "Envie somente documentos públicos.";
    $("ocrCheck").checked = CONFIG.ocrEnabledByDefault !== false;
    $("year").textContent = new Date().getFullYear();

    if (CONFIG.logoUrl) {
      const mark = $("brandMark");
      mark.textContent = "";
      mark.style.backgroundImage = `url(${JSON.stringify(CONFIG.logoUrl).slice(1, -1)})`;
      mark.style.backgroundSize = "cover";
      mark.style.backgroundPosition = "center";
    }

    bindUpload();
    $("privacyCheck").addEventListener("change", refreshAnalyzeButton);
    $("removeFile").addEventListener("click", clearFile);
    $("analyzeBtn").addEventListener("click", analyzeFile);
    $("demoBtn").addEventListener("click", loadDemo);
    $("requestPdfTop").addEventListener("click", requestPdf);
    $("requestPdfBottom").addEventListener("click", requestPdf);
    $("stickyRequestBtn").addEventListener("click", requestPdf);
  }

  function bindUpload() {
    const zone = $("uploadZone");
    const input = $("fileInput");

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) setFile(file);
    });

    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("dragover");
    });

    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));

    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("dragover");
      const file = event.dataTransfer.files?.[0];
      if (file) setFile(file);
    });
  }

  function setFile(file) {
    hideError();
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return showError("Selecione um arquivo PDF válido.");

    const maxBytes = (CONFIG.maxFileSizeMB || 35) * 1024 * 1024;
    if (file.size > maxBytes) {
      return showError(`O arquivo excede o limite de ${CONFIG.maxFileSizeMB || 35} MB.`);
    }

    state.file = file;
    $("fileName").textContent = file.name;
    $("fileMeta").textContent = formatBytes(file.size);
    $("selectedFile").hidden = false;
    refreshAnalyzeButton();
  }

  function clearFile() {
    state.file = null;
    state.pages = [];
    state.fingerprint = null;
    $("fileInput").value = "";
    $("selectedFile").hidden = true;
    $("reportSection").hidden = true;
    $("stickyRequest").hidden = true;
    refreshAnalyzeButton();
  }

  function refreshAnalyzeButton() {
    $("analyzeBtn").disabled = !(state.file && $("privacyCheck").checked) || state.busy;
  }

  async function analyzeFile() {
    if (!state.file || state.busy) return;
    setBusy(true);
    hideError();
    $("reportSection").hidden = true;
    $("stickyRequest").hidden = true;
    $("progressPanel").hidden = false;
    state.report = null;
    state.requestCode = null;

    try {
      setProgress(1, 2, "Preparando o edital...", "Calculando a identificação segura do arquivo.");
      const buffer = await state.file.arrayBuffer();
      state.fingerprint = await fingerprintFile(buffer, state.file);

      setProgress(1, 5, "Abrindo e lendo o PDF...", "O texto é extraído página por página no seu navegador.");
      const pages = await extractPages(buffer, $("ocrCheck").checked);
      state.pages = pages;

      const totalCharacters = pages.reduce((sum, page) => sum + page.text.length, 0);
      if (totalCharacters < 300) {
        throw new Error("Foi encontrado pouco texto no documento. Tente ativar o OCR ou utilize uma versão do edital com melhor qualidade.");
      }

      setProgress(2, 28, "Reservando uma análise gratuita...", "A ferramenta verifica o limite diário antes de utilizar a IA.");
      const session = await apiPost("/api/start-analysis", {
        fingerprint: state.fingerprint,
        pageCount: pages.length,
        charCount: totalCharacters,
      });
      state.sessionId = session.sessionId;

      const chunks = buildPageChunks(pages, 26000);
      const extracts = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const percent = 30 + Math.round(((index + 1) / chunks.length) * 37);
        setProgress(
          2,
          percent,
          `Analisando o bloco ${index + 1} de ${chunks.length}...`,
          `A IA está extraindo dados comprováveis das páginas ${chunks[index][0].page} a ${chunks[index][chunks[index].length - 1].page}.`
        );

        const response = await apiPost("/api/analyze", {
          sessionId: state.sessionId,
          phase: "extract",
          payload: {
            fileName: state.file.name,
            totalPages: pages.length,
            pages: chunks[index],
          },
        });
        extracts.push(response.result);
      }

      setProgress(3, 72, "Consolidando cargos, datas e regras...", "A IA está eliminando duplicações e separando regras gerais das regras de cada cargo.");
      const consolidation = await apiPost("/api/analyze", {
        sessionId: state.sessionId,
        phase: "consolidate",
        payload: {
          fileName: state.file.name,
          totalPages: pages.length,
          extracts,
        },
      });

      setProgress(4, 87, "Auditando a análise...", "Uma nova leitura procura conflitos, associações incorretas e informações sem página de origem.");
      const audit = await apiPost("/api/analyze", {
        sessionId: state.sessionId,
        phase: "audit",
        payload: {
          fileName: state.file.name,
          totalPages: pages.length,
          extracts,
          consolidatedReport: consolidation.result,
        },
      });

      state.report = normalizeReport(audit.result || consolidation.result, {
        source_file: state.file.name,
        analyzed_pages: pages.length,
        generated_at: new Date().toLocaleString("pt-BR"),
        fingerprint: state.fingerprint,
      });

      setProgress(5, 98, "Montando o relatório completo...", "Organizando o edital verticalizado e todas as seções para leitura online.");
      renderReport(state.report);
      setProgress(5, 100, "Análise concluída", "O relatório completo está liberado para leitura online.");
      setTimeout(() => $("reportSection").scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    } catch (error) {
      console.error(error);
      const message = mapFriendlyError(error);
      showError(message);
      setProgress(1, 0, "Não foi possível concluir", message);
    } finally {
      setBusy(false);
    }
  }

  async function extractPages(buffer, useOcr) {
    if (!window.pdfjsLib) {
      throw new Error("A biblioteca de leitura de PDF não foi carregada. Autorize os recursos externos ou tente novamente após a publicação.");
    }
    const loadingTask = window.pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    if (pdf.numPages > (CONFIG.maxPages || 350)) {
      throw new Error(`O documento possui ${pdf.numPages} páginas. O limite atual é de ${CONFIG.maxPages || 350} páginas.`);
    }

    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const percent = 6 + Math.round((pageNumber / pdf.numPages) * 20);
      setProgress(1, percent, `Lendo a página ${pageNumber} de ${pdf.numPages}...`, "O processamento inicial acontece no seu dispositivo.");

      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = content.items
        .map((item) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      let method = "text";

      if (useOcr && text.length < 80) {
        setProgress(1, percent, `Executando OCR na página ${pageNumber}...`, "Páginas digitalizadas demoram mais porque precisam ser reconhecidas como imagem.");
        try {
          const viewport = page.getViewport({ scale: 1.55 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { willReadFrequently: true });
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: context, viewport }).promise;
          if (!window.Tesseract) throw new Error("Biblioteca de OCR não carregada.");
          const ocr = await window.Tesseract.recognize(canvas, "por", { logger: () => {} });
          text = (ocr.data.text || "").replace(/\s+/g, " ").trim();
          method = "ocr";
          canvas.width = 1;
          canvas.height = 1;
        } catch (ocrError) {
          console.warn("OCR não concluído na página", pageNumber, ocrError);
          method = "unreadable";
        }
      }

      pages.push({ page: pageNumber, text, method });
    }
    return pages;
  }

  function buildPageChunks(pages, maxCharacters) {
    const chunks = [];
    let current = [];
    let currentSize = 0;

    for (const page of pages) {
      const size = page.text.length + 60;
      if (current.length && currentSize + size > maxCharacters) {
        chunks.push(current);
        current = [];
        currentSize = 0;
      }
      current.push(page);
      currentSize += size;
    }
    if (current.length) chunks.push(current);
    return chunks;
  }

  async function requestPdf() {
    if (!state.report) return;
    const buttons = [$("requestPdfTop"), $("requestPdfBottom"), $("stickyRequestBtn")];
    buttons.forEach((button) => (button.disabled = true));

    try {
      let code = state.requestCode;
      if (!code) {
        const result = await apiPost("/api/request-report", {
          fingerprint: state.fingerprint || state.report.metadata?.fingerprint || "demo",
          fileName: state.file?.name || state.report.metadata?.source_file || "edital.pdf",
          report: state.report,
        });
        code = result.code;
        state.requestCode = code;
      }

      const competition = state.report.identification?.competition_name || "Concurso não identificado";
      const message = [
        `Olá, ${CONFIG.professorName || "Professor Lucas MPC"}.`,
        "",
        `Utilizei o ${CONFIG.toolName} e gostaria de receber gratuitamente o PDF completo da análise.`,
        "",
        `Concurso: ${competition}`,
        `Código exclusivo: ${code}`,
        `Arquivo: ${state.file?.name || state.report.metadata?.source_file || "edital.pdf"}`,
      ].join("\n");

      const number = String(CONFIG.whatsappNumber || "").replace(/\D/g, "");
      const resultBox = $("requestResult");
      resultBox.hidden = false;
      resultBox.innerHTML = `<strong>Código gerado: ${escapeHtml(code)}</strong><br>Esse código identifica exatamente esta análise no painel privado do professor.`;

      if (!number || number === "5511999999999") {
        throw new Error("O número do WhatsApp ainda não foi configurado no arquivo public/config.js.");
      }
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    } catch (error) {
      showError(error.message || "Não foi possível registrar a solicitação do PDF.");
    } finally {
      buttons.forEach((button) => (button.disabled = false));
    }
  }

  function loadDemo() {
    state.file = null;
    state.fingerprint = "DEMO-ANALISE-MPC";
    state.report = normalizeReport(window.MPC_DEMO_REPORT, window.MPC_DEMO_REPORT.metadata);
    renderReport(state.report);
    $("reportSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderReport(report) {
    $("reportSection").hidden = false;
    $("stickyRequest").hidden = false;
    $("reportTitle").textContent = report.identification.competition_name || "Análise do edital";
    $("reportSubtitle").textContent = `${report.identification.notice_number || "Edital não identificado"} · ${report.metadata.analyzed_pages || "—"} páginas analisadas`;

    const confidence = String(report.audit.overall_confidence || "média").toLowerCase();
    const confidenceLabel = confidence === "alta" ? "Alta confiança" : confidence === "baixa" ? "Baixa confiança" : "Confiança moderada";
    $("qualityBanner").innerHTML = `
      <div class="file-icon">IA</div>
      <div><strong>${escapeHtml(confidenceLabel)}</strong><span>${escapeHtml(report.audit.summary || "Confira as pendências e as páginas de origem antes de tomar decisões.")}</span></div>
    `;

    const sections = buildReportSections(report);
    $("reportNav").innerHTML = sections
      .map((section) => `<a href="#${section.id}">${escapeHtml(section.label)}</a>`)
      .join("");
    $("reportContent").innerHTML = sections.map((section) => section.html).join("");
  }

  function buildReportSections(report) {
    return [
      section("identification", SECTION_LABELS.identification, renderIdentification(report)),
      section("executive", SECTION_LABELS.executive, renderExecutive(report)),
      section("positions", SECTION_LABELS.positions, renderPositions(report)),
      section("registration", SECTION_LABELS.registration, renderRegistration(report)),
      section("timeline", SECTION_LABELS.timeline, renderTimeline(report)),
      section("stages", SECTION_LABELS.stages, renderStages(report)),
      section("tests", SECTION_LABELS.tests, renderTests(report)),
      section("criteria", SECTION_LABELS.criteria, renderCriteria(report)),
      section("verticalized", SECTION_LABELS.verticalized, renderVerticalized(report)),
      section("attention", SECTION_LABELS.attention, renderAttention(report)),
      section("pending", SECTION_LABELS.pending, renderPending(report)),
      section("audit", SECTION_LABELS.audit, renderAudit(report)),
    ];
  }

  function section(id, label, body) {
    return { id, label, html: `<section class="report-block" id="${id}"><h3>${escapeHtml(label)}</h3>${body}</section>` };
  }

  function renderIdentification(report) {
    const item = report.identification;
    return `<div class="kv-grid">
      ${kv("Concurso", item.competition_name, item.source_pages)}
      ${kv("Órgão", item.agency, item.source_pages)}
      ${kv("Banca", item.organizer, item.source_pages)}
      ${kv("Edital", item.notice_number, item.source_pages)}
      ${kv("Publicação", item.publication_date, item.source_pages)}
      ${kv("Abrangência", item.scope, item.source_pages)}
    </div>`;
  }

  function renderExecutive(report) {
    return `<p>${escapeHtml(report.executive_summary || "Resumo executivo não gerado.")}</p>`;
  }

  function renderPositions(report) {
    if (!report.positions.length) return empty("Nenhum cargo foi identificado com segurança.");
    return `<div class="data-table-wrap"><table class="data-table"><thead><tr>
      <th>Cargo</th><th>Vagas</th><th>Escolaridade e requisitos</th><th>Jornada</th><th>Remuneração</th><th>Inscrição</th><th>Páginas</th>
    </tr></thead><tbody>${report.positions.map((position) => `<tr>
      <td><strong>${escapeHtml(position.name)}</strong></td>
      <td>${escapeHtml(position.vacancies)}</td>
      <td>${escapeHtml(joinNonEmpty([position.education, position.requirements], " · "))}</td>
      <td>${escapeHtml(position.workload)}</td>
      <td>${escapeHtml(joinNonEmpty([position.compensation, position.benefits], " · "))}</td>
      <td>${escapeHtml(position.registration_fee)}</td>
      <td>${pageRefs(position.source_pages)}</td>
    </tr>`).join("")}</tbody></table></div>`;
  }

  function renderRegistration(report) {
    const item = report.registration;
    return `<div class="kv-grid">
      ${kv("Início", item.start_date, item.source_pages)}
      ${kv("Encerramento", item.end_date, item.source_pages)}
      ${kv("Pagamento", item.payment_deadline, item.source_pages)}
      ${kv("Site", item.website, item.source_pages)}
      ${kv("Isenção", item.exemption_period, item.source_pages)}
      ${kv("Atendimento especial", item.special_service, item.source_pages)}
    </div>`;
  }

  function renderTimeline(report) {
    if (!report.timeline.length) return empty("Nenhum evento com data definida foi identificado.");
    return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Evento</th><th>Data ou período</th><th>Páginas</th></tr></thead><tbody>
      ${report.timeline.map((item) => `<tr><td>${escapeHtml(item.event)}</td><td><strong>${escapeHtml(item.date)}</strong></td><td>${pageRefs(item.source_pages)}</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function renderStages(report) {
    if (!report.stages.length) return empty("Nenhuma etapa foi identificada com segurança.");
    return `<ul class="item-list">${report.stages.map((item) => `<li><strong>${escapeHtml(item.name)} — ${escapeHtml(item.nature)}</strong><small>${escapeHtml(item.details)} ${pageRefs(item.source_pages)}</small></li>`).join("")}</ul>`;
  }

  function renderTests(report) {
    if (!report.objective_tests.length) return empty("A estrutura da prova não foi localizada ou varia por cargo sem quadro consolidado.");
    return `<div class="data-table-wrap"><table class="data-table"><thead><tr>
      <th>Cargo</th><th>Disciplina</th><th>Questões</th><th>Peso</th><th>Pontos</th><th>Regra mínima</th><th>Páginas</th>
    </tr></thead><tbody>${report.objective_tests.map((item) => `<tr>
      <td>${escapeHtml(item.position)}</td><td>${escapeHtml(item.discipline)}</td><td>${escapeHtml(item.questions)}</td><td>${escapeHtml(item.weight)}</td><td>${escapeHtml(item.total_points)}</td><td>${escapeHtml(item.minimum_rule)}</td><td>${pageRefs(item.source_pages)}</td>
    </tr>`).join("")}</tbody></table></div>`;
  }

  function renderCriteria(report) {
    if (!report.approval_criteria.length) return empty("Nenhum critério foi consolidado com segurança.");
    return `<ul class="item-list">${report.approval_criteria.map((item) => `<li>${escapeHtml(item.rule)} ${pageRefs(item.source_pages)}</li>`).join("")}</ul>`;
  }

  function renderVerticalized(report) {
    if (!report.verticalized_notice.length) return empty("O conteúdo programático não foi localizado nos trechos analisados.");
    return `<p>Foram verticalizados <strong>${report.verticalized_notice.length}</strong> tópicos. A prioridade permanece “A definir” quando não existe peso oficial no edital.</p>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>Nº</th><th>Cargo</th><th>Disciplina</th><th>Assunto</th><th>Subassunto</th><th>Páginas</th><th>Prioridade</th><th>Status</th>
      </tr></thead><tbody>${report.verticalized_notice.map((item, index) => `<tr>
        <td>${escapeHtml(item.number || index + 1)}</td><td>${escapeHtml(item.position)}</td><td><strong>${escapeHtml(item.discipline)}</strong></td><td>${escapeHtml(item.topic)}</td><td>${escapeHtml(item.subtopic)}</td><td>${pageRefs(item.source_pages)}</td><td>${escapeHtml(item.priority)}</td><td>${escapeHtml(item.status)}</td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function renderAttention(report) {
    if (!report.attention_points.length) return empty("Nenhum ponto adicional de atenção foi consolidado.");
    return `<ul class="item-list alert-list">${report.attention_points.map((item) => `<li><strong>${escapeHtml(item.title)} · ${escapeHtml(item.severity)}</strong><small>${escapeHtml(item.detail)} ${pageRefs(item.source_pages)}</small></li>`).join("")}</ul>`;
  }

  function renderPending(report) {
    if (!report.pending_items.length) return `<ul class="item-list good-list"><li><strong>Nenhuma pendência crítica registrada</strong><small>Ainda assim, confira o edital oficial e eventuais retificações.</small></li></ul>`;
    return `<ul class="item-list alert-list">${report.pending_items.map((item) => `<li><strong>${escapeHtml(item.item)}</strong><small>${escapeHtml(item.reason)} ${pageRefs(item.source_pages)}</small></li>`).join("")}</ul>`;
  }

  function renderAudit(report) {
    const audit = report.audit;
    const conflicts = audit.conflicts || [];
    const checks = audit.checks || [];
    return `<p><strong>Confiança geral:</strong> ${escapeHtml(audit.overall_confidence)}.</p>
      <p>${escapeHtml(audit.summary)}</p>
      <h4>Verificações concluídas</h4>
      ${checks.length ? `<ul class="item-list good-list">${checks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : empty("Nenhuma verificação adicional registrada.")}
      <h4>Conflitos encontrados</h4>
      ${conflicts.length ? `<ul class="item-list alert-list">${conflicts.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : item.description || JSON.stringify(item))}</li>`).join("")}</ul>` : `<ul class="item-list good-list"><li>Nenhum conflito explícito foi registrado pela auditoria.</li></ul>`}`;
  }

  function normalizeReport(raw, metadata = {}) {
    const report = raw && typeof raw === "object" ? raw : {};
    return {
      identification: normalizeObject(report.identification, {
        competition_name: "Não identificado",
        agency: "Não identificado",
        organizer: "Não identificado",
        notice_number: "Não identificado",
        publication_date: "Não localizada",
        scope: "Não identificado",
        official_link: "Não localizado",
        source_pages: [],
      }),
      executive_summary: stringValue(report.executive_summary, "Resumo não disponível."),
      positions: arrayValue(report.positions).map((item) => normalizeObject(item, {
        name: "Cargo não identificado", vacancies: "Não informado", education: "Não informado",
        requirements: "Não informado", workload: "Não informado", compensation: "Não informado",
        benefits: "Não informado", registration_fee: "Não informado", source_pages: [],
      })),
      registration: normalizeObject(report.registration, {
        start_date: "Não localizada", end_date: "Não localizada", payment_deadline: "Não localizada",
        website: "Não localizado", exemption_period: "Não localizado", special_service: "Não localizado", source_pages: [],
      }),
      timeline: arrayValue(report.timeline).map((item) => normalizeObject(item, { event: "Evento", date: "Não informada", source_pages: [] })),
      stages: arrayValue(report.stages).map((item) => normalizeObject(item, { name: "Etapa", nature: "Não informado", details: "", source_pages: [] })),
      objective_tests: arrayValue(report.objective_tests).map((item) => normalizeObject(item, {
        position: "Todos", discipline: "Não identificada", questions: "Não informado", weight: "Não informado",
        total_points: "Não informado", minimum_rule: "Não informada", source_pages: [],
      })),
      approval_criteria: arrayValue(report.approval_criteria).map((item) => normalizeObject(item, { rule: "Critério não detalhado", source_pages: [] })),
      verticalized_notice: arrayValue(report.verticalized_notice).map((item, index) => normalizeObject(item, {
        number: index + 1, position: "Todos", discipline: "Não identificada", topic: "Não identificado",
        subtopic: "", source_pages: [], priority: "A definir", status: "Não iniciado",
      })),
      attention_points: arrayValue(report.attention_points).map((item) => normalizeObject(item, { title: "Atenção", detail: "", severity: "média", source_pages: [] })),
      pending_items: arrayValue(report.pending_items).map((item) => normalizeObject(item, { item: "Pendência", reason: "", source_pages: [] })),
      audit: normalizeObject(report.audit, {
        overall_confidence: "média", summary: "Confira as informações com o edital oficial.", conflicts: [], checks: [],
      }),
      metadata: { ...(report.metadata || {}), ...metadata },
    };
  }

  function normalizeObject(value, defaults) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const output = { ...defaults, ...source };
    if ("source_pages" in output) output.source_pages = normalizePages(output.source_pages);
    if (Array.isArray(output.conflicts)) output.conflicts = output.conflicts;
    if (Array.isArray(output.checks)) output.checks = output.checks;
    Object.keys(output).forEach((key) => {
      if (output[key] === null || output[key] === undefined || output[key] === "") {
        output[key] = defaults[key] ?? "Não informado";
      }
    });
    return output;
  }

  function normalizePages(value) {
    const source = Array.isArray(value) ? value : value ? [value] : [];
    return [...new Set(source.map((item) => Number.parseInt(item, 10)).filter(Number.isFinite))].sort((a, b) => a - b);
  }

  function arrayValue(value) { return Array.isArray(value) ? value : []; }
  function stringValue(value, fallback) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }

  function kv(label, value, pages) {
    return `<div class="kv"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Não informado")} ${pageRefs(pages)}</strong></div>`;
  }

  function pageRefs(pages) {
    const normalized = normalizePages(pages);
    if (!normalized.length) return '<span class="source-ref">página não indicada</span>';
    return `<span class="source-ref">p. ${normalized.join(", ")}</span>`;
  }

  function empty(message) { return `<div class="empty-state">${escapeHtml(message)}</div>`; }
  function joinNonEmpty(values, separator) { return values.filter((item) => item && item !== "Não informado").join(separator) || "Não informado"; }

  function setBusy(value) {
    state.busy = value;
    refreshAnalyzeButton();
    $("demoBtn").disabled = value;
  }

  function setProgress(step, percent, title, detail) {
    $("progressPanel").hidden = false;
    $("progressStep").textContent = `Etapa ${step} de 5`;
    $("progressTitle").textContent = title;
    $("progressPercent").textContent = `${Math.round(percent)}%`;
    $("progressBar").style.width = `${Math.max(0, Math.min(100, percent))}%`;
    $("progressDetail").textContent = detail;
    document.querySelectorAll("#stepList span").forEach((element) => {
      const number = Number(element.dataset.step);
      element.classList.toggle("done", number < step);
      element.classList.toggle("active", number === step);
    });
  }

  async function apiPost(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Erro ${response.status}`);
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    return data;
  }

  async function fingerprintFile(buffer, file) {
    const bytes = new Uint8Array(buffer);
    const sample = bytes.slice(0, Math.min(bytes.length, 400000));
    const meta = new TextEncoder().encode(`${file.name}|${file.size}|${file.lastModified}|`);
    const combined = new Uint8Array(meta.length + sample.length);
    combined.set(meta);
    combined.set(sample, meta.length);
    const digest = await crypto.subtle.digest("SHA-256", combined);
    return toBase64Url(new Uint8Array(digest)).slice(0, 32);
  }

  function toBase64Url(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function mapFriendlyError(error) {
    if (error.code === "FREE_QUOTA_EXHAUSTED" || error.status === 429) {
      return "O limite gratuito de análises foi atingido. Nenhuma cobrança será feita. Tente novamente mais tarde ou no próximo dia.";
    }
    if (error.code === "AI_TIMEOUT" || error.status === 504) {
      return "A inteligência artificial demorou mais do que o limite permitido nesta etapa. Tente novamente; a ferramenta já usa blocos menores para reduzir esse problema.";
    }
    if (error.code === "API_NOT_CONFIGURED") {
      return "A chave gratuita da Gemini ainda não foi configurada. Use a demonstração para avaliar o visual e configure a chave ao publicar no Netlify.";
    }
    if (/Failed to fetch|NetworkError/i.test(error.message || "")) {
      return "Não foi possível comunicar com o serviço de análise. Verifique sua conexão e tente novamente.";
    }
    return error.message || "Ocorreu um erro inesperado durante a análise.";
  }

  function showError(message) {
    const box = $("errorBox");
    box.hidden = false;
    box.textContent = message;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideError() {
    $("errorBox").hidden = true;
    $("errorBox").textContent = "";
  }

  function formatBytes(bytes) {
    const units = ["B", "KB", "MB", "GB"];
    if (!bytes) return "0 B";
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
