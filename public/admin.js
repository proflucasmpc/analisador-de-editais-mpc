(() => {
  "use strict";
  const CONFIG = window.MPC_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  let secret = "";
  let records = [];
  let selected = null;
  let pdfY = 24;

  $("loginBtn").addEventListener("click", login);
  $("adminSecret").addEventListener("keydown", (event) => { if (event.key === "Enter") login(); });
  $("refreshBtn").addEventListener("click", loadRecords);
  $("findBtn").addEventListener("click", filterRecords);
  $("searchCode").addEventListener("input", filterRecords);

  async function login() {
    const value = $("adminSecret").value.trim();
    if (!value) return setMessage("loginMessage", "Digite a senha administrativa.", false);
    secret = value;
    $("loginBtn").disabled = true;
    try {
      await loadRecords();
      $("loginCard").hidden = true;
      $("dashboard").hidden = false;
    } catch (error) {
      secret = "";
      setMessage("loginMessage", error.message || "Não foi possível entrar.", false);
    } finally {
      $("loginBtn").disabled = false;
    }
  }

  async function loadRecords() {
    const data = await adminFetch("/api/admin-report?action=list");
    records = data.records || [];
    renderList(records);
    setMessage("dashboardMessage", `${records.length} solicitação(ões) localizada(s).`, true);
  }

  function filterRecords() {
    const term = $("searchCode").value.trim().toLowerCase();
    if (!term) return renderList(records);
    renderList(records.filter((item) =>
      String(item.code).toLowerCase().includes(term) ||
      String(item.competitionName).toLowerCase().includes(term) ||
      String(item.fileName).toLowerCase().includes(term)
    ));
  }

  function renderList(items) {
    const list = $("recordList");
    if (!items.length) {
      list.innerHTML = '<div class="empty">Nenhuma solicitação encontrada.</div>';
      return;
    }
    list.innerHTML = items.map((item) => `
      <button class="record ${selected?.code === item.code ? "active" : ""}" data-code="${escapeHtml(item.code)}" type="button">
        <strong>${escapeHtml(item.competitionName || "Concurso não identificado")}</strong>
        <span>${escapeHtml(item.code)} · ${escapeHtml(statusLabel(item.status))}</span>
        <small>${escapeHtml(item.fileName || "edital.pdf")} · ${formatDate(item.createdAt)}</small>
      </button>
    `).join("");
    list.querySelectorAll("[data-code]").forEach((button) => {
      button.addEventListener("click", () => openRecord(button.dataset.code));
    });
  }

  async function openRecord(code) {
    setMessage("dashboardMessage", "Carregando relatório...", true);
    const data = await adminFetch(`/api/admin-report?code=${encodeURIComponent(code)}`);
    selected = data.record;
    renderList(records);
    renderDetail(selected);
    setMessage("dashboardMessage", "Relatório carregado.", true);
  }

  function renderDetail(record) {
    const report = record.report || {};
    const id = report.identification || {};
    const metrics = report.audit?.metrics || {};
    $("recordDetail").innerHTML = `
      <span class="status">${escapeHtml(statusLabel(record.status))}</span>
      <h2>${escapeHtml(record.competitionName || id.competition_name || "Concurso não identificado")}</h2>
      <p class="summary">${escapeHtml(report.executive_summary || "Resumo não disponível.")}</p>
      <div class="meta">
        <div><span>Código</span><strong>${escapeHtml(record.code)}</strong></div>
        <div><span>Arquivo</span><strong>${escapeHtml(record.fileName)}</strong></div>
        <div><span>Solicitado em</span><strong>${formatDate(record.createdAt)}</strong></div>
        <div><span>Cargos</span><strong>${Array.isArray(report.positions) ? report.positions.length : 0}</strong></div>
        <div><span>Tópicos verticalizados</span><strong>${Array.isArray(report.verticalized_notice) ? report.verticalized_notice.length : 0}</strong></div>
        <div><span>Confiança</span><strong>${escapeHtml(report.audit?.overall_confidence || "Não informada")}</strong></div>
        <div><span>Cobertura programática</span><strong>${escapeHtml(metrics.program_coverage || "Não medida")}</strong></div>
        <div><span>Referências de página</span><strong>${escapeHtml(metrics.page_references_verified || "Não medida")}</strong></div>
      </div>
      <div class="actions">
        <button class="gold" id="downloadPdf" type="button">BAIXAR PDF COMPLETO</button>
        <button class="ghost" data-status="baixado" type="button">MARCAR COMO BAIXADO</button>
        <button class="green" data-status="enviado" type="button">MARCAR COMO ENVIADO</button>
        <button class="ghost" data-status="concluido" type="button">CONCLUIR PEDIDO</button>
      </div>
    `;
    $("downloadPdf").addEventListener("click", () => generatePdf(record));
    $("recordDetail").querySelectorAll("[data-status]").forEach((button) => {
      button.addEventListener("click", () => updateStatus(record.code, button.dataset.status));
    });
  }

  async function updateStatus(code, status) {
    const data = await adminFetch("/api/admin-report", {
      method: "POST",
      body: JSON.stringify({ code, status }),
    });
    selected = data.record;
    records = records.map((item) => item.code === code ? { ...item, status: selected.status, updatedAt: selected.updatedAt } : item);
    renderList(records);
    renderDetail(selected);
    setMessage("dashboardMessage", `Status alterado para ${statusLabel(status)}.`, true);
  }

  async function adminFetch(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "content-type": "application/json",
        "x-admin-secret": secret,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
    return data;
  }

  async function generatePdf(record) {
    const report = record.report || {};
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const fileName = safeFileName(report.identification?.competition_name || record.competitionName || "Edital");

    drawCover(doc, report, record);
    doc.addPage();
    pdfY = 24;

    addIdentification(doc, report);
    addTextSection(doc, "Resumo executivo", [report.executive_summary || "Resumo não disponível."]);
    addPositions(doc, report.positions || []);
    addRegistration(doc, report.registration || {});
    addTimeline(doc, report.timeline || []);
    addStages(doc, report.stages || []);
    addExamOverview(doc, report.exam_overview || {});
    addTests(doc, report.objective_tests || []);
    addSimpleTable(doc, "Critérios de aprovação e eliminação", ["Regra", "Página(s) do edital original"],
      (report.approval_criteria || []).map((item) => [item.rule, pagesText(item.source_pages)]), 8.2);
    addVerticalized(doc, report.verticalized_notice || []);
    addSimpleTable(doc, "Pontos que exigem atenção", ["Ponto", "Detalhamento", "Gravidade", "Página(s)"],
      (report.attention_points || []).map((item) => [item.title, item.detail, item.severity, pagesText(item.source_pages)]), 7.8);
    addSimpleTable(doc, "Pendências e conferências necessárias", ["Item", "Motivo", "Página(s)"],
      (report.pending_items || []).map((item) => [item.item, item.reason, pagesText(item.source_pages)]), 8);
    addAudit(doc, report.audit || {});
    addTextSection(doc, "Aviso final", [
      "Este relatório foi produzido automaticamente a partir do edital enviado.",
      "A análise auxilia a organização do estudo, mas não substitui a leitura do edital oficial, das retificações e dos comunicados da banca.",
      "Confirme datas, requisitos, notas mínimas, documentos e regras de eliminação antes de tomar qualquer decisão.",
    ]);

    decoratePages(doc, record.code);
    doc.save(`Analise_${fileName}_MPC_${record.code}.pdf`);
    setMessage("dashboardMessage", "PDF gerado e baixado no seu computador.", true);
  }

  function drawCover(doc, report, record) {
    const id = report.identification || {};
    doc.setFillColor(5, 11, 23); doc.rect(0, 0, 210, 297, "F");
    doc.setFillColor(214, 169, 40); doc.roundedRect(16, 17, 36, 17, 3, 3, "F");
    doc.setTextColor(7, 16, 30); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text("LUCAS MPC", 34, 28, { align: "center" });
    doc.setTextColor(243, 211, 111); doc.setFontSize(11); doc.text(String(CONFIG.toolName || "ANALISADOR DE EDITAIS MPC").toUpperCase(), 16, 65);
    doc.setTextColor(255, 255, 255); doc.setFontSize(26); doc.text("ANÁLISE PROFUNDA", 16, 88); doc.text("DO EDITAL", 16, 101);
    doc.setFontSize(16); const coverTitle = doc.splitTextToSize(id.competition_name || record.competitionName || "Concurso não identificado", 175); doc.text(coverTitle, 16, 121);
    doc.setTextColor(173, 187, 207); doc.setFontSize(10.5);
    const y = 153 + Math.max(0, coverTitle.length - 1) * 7;
    doc.text(`Edital: ${id.notice_number || "Não identificado"}`, 16, y);
    doc.text(`Órgão: ${id.agency || "Não identificado"}`, 16, y + 10);
    doc.text(`Banca: ${id.organizer || "Não identificada"}`, 16, y + 20);
    doc.text(`Código do pedido: ${record.code}`, 16, y + 30);
    doc.setFillColor(14, 29, 51); doc.roundedRect(16, 214, 178, 39, 4, 4, "F");
    doc.setTextColor(243, 211, 111); doc.setFontSize(13); doc.text("Inclui edital verticalizado integral", 25, 229);
    doc.setTextColor(225, 232, 243); doc.setFontSize(9.5);
    doc.text(doc.splitTextToSize("Cargos, datas, etapas, critérios e conteúdo programático organizados com rastreabilidade por página do edital original.", 158), 25, 240);
  }

  function addIdentification(doc, report) {
    const id = report.identification || {};
    const map = id.source_by_field || {};
    addSimpleTable(doc, "Identificação do concurso", ["Campo", "Informação", "Página(s) do edital original"], [
      ["Concurso", id.competition_name, pagesText(map.competition_name || id.source_pages)],
      ["Órgão", id.agency, pagesText(map.agency || id.source_pages)],
      ["Banca", id.organizer, pagesText(map.organizer || id.source_pages)],
      ["Número do edital", id.notice_number, pagesText(map.notice_number || id.source_pages)],
      ["Data de publicação", id.publication_date, pagesText(map.publication_date || id.source_pages)],
      ["Abrangência", id.scope, pagesText(map.scope || id.source_pages)],
      ["Link oficial", id.official_link, pagesText(map.official_link || id.source_pages)],
    ], 8.4);
  }

  function addPositions(doc, items) {
    if (!items.length) return addTextSection(doc, "Cargos, vagas e requisitos", ["Nenhum cargo foi identificado com segurança."]);
    for (const [index, item] of items.entries()) {
      const map = item.source_by_field || {};
      addSimpleTable(doc, index === 0 ? "Cargos, vagas e requisitos" : `Cargo — ${item.name || index + 1}`,
        ["Campo", "Informação", "Página(s) do edital original"], [
          ["Cargo", item.name, pagesText(map.name || item.source_pages)],
          ["Vagas", item.vacancies, pagesText(map.vacancies || item.source_pages)],
          ["Escolaridade", item.education, pagesText(map.education || item.source_pages)],
          ["Requisitos para inscrição", item.registration_requirements || item.requirements, pagesText(map.registration_requirements || map.requirements || item.source_pages)],
          ["Condições/requisitos para posse", item.possession_requirements || "Não localizado na análise", pagesText(map.possession_requirements || item.source_pages)],
          ["Outras condições relevantes", item.other_conditions || "Não localizado na análise", pagesText(map.other_conditions || item.source_pages)],
          ["Jornada", item.workload, pagesText(map.workload || item.source_pages)],
          ["Remuneração", item.compensation, pagesText(map.compensation || item.source_pages)],
          ["Benefícios/parcelas", item.benefits, pagesText(map.benefits || item.source_pages)],
          ["Taxa de inscrição", item.registration_fee, pagesText(map.registration_fee || item.source_pages)],
        ], 7.8);
    }
  }

  function addRegistration(doc, item) {
    const map = item.source_by_field || {};
    addSimpleTable(doc, "Inscrições, pagamento e condições especiais", ["Campo", "Informação", "Página(s) do edital original"], [
      ["Início", item.start_date, pagesText(map.start_date || item.source_pages)],
      ["Encerramento", item.end_date, pagesText(map.end_date || item.source_pages)],
      ["Pagamento", item.payment_deadline, pagesText(map.payment_deadline || item.source_pages)],
      ["Site", item.website, pagesText(map.website || item.source_pages)],
      ["Isenção/redução", item.exemption_period, pagesText(map.exemption_period || item.source_pages)],
      ["Condição/atendimento especial", item.special_service, pagesText(map.special_service || item.source_pages)],
      ["Lactação/amamentação", item.lactation || "Não localizado na análise", pagesText(map.lactation || item.source_pages)],
    ], 8);
  }

  function addTimeline(doc, items) {
    addSimpleTable(doc, "Cronograma", ["Evento", "Data ou período", "Página(s) do edital original"],
      items.map((item) => [item.event, item.date, pagesText(item.source_pages)]), 8);
  }

  function addStages(doc, items) {
    addSimpleTable(doc, "Etapas do concurso", ["Etapa", "Natureza", "Detalhamento", "Página(s)"],
      items.map((item) => [item.name, item.nature, item.details, pagesText(item.source_pages)]), 7.7);
  }

  function addExamOverview(doc, item) {
    if (!item || !Object.keys(item).length) return;
    const map = item.source_by_field || {};
    addSimpleTable(doc, "Visão geral das provas", ["Regra", "Informação", "Página(s) do edital original"], [
      ["Duração", item.duration, pagesText(map.duration || item.source_pages)],
      ["Período/turno", item.application_period, pagesText(map.application_period || item.source_pages)],
      ["Aplicação simultânea", item.simultaneous_application, pagesText(map.simultaneous_application || item.source_pages)],
      ["Objetiva — pontuação total", item.objective_total_points, pagesText(map.objective_total_points || item.source_pages)],
      ["Valor por questão", item.question_value, pagesText(map.question_value || item.source_pages)],
      ["Objetiva — mínimo", item.objective_minimum, pagesText(map.objective_minimum || item.source_pages)],
      ["Redação — pontuação total", item.essay_total_points, pagesText(map.essay_total_points || item.source_pages)],
      ["Redação — mínimo", item.essay_minimum, pagesText(map.essay_minimum || item.source_pages)],
      ["Redação — máximo de linhas", item.essay_max_lines, pagesText(map.essay_max_lines || item.source_pages)],
    ], 8);
  }

  function addTests(doc, items) {
    addSimpleTable(doc, "Distribuição das questões", ["Cargo", "Disciplina", "Questões", "Peso", "Regra mínima", "Página(s)"],
      items.map((item) => [item.position, item.discipline, item.questions, item.weight, item.minimum_rule, pagesText(item.source_pages)]), 7.6);
  }

  function addVerticalized(doc, items) {
    const rows = items.map((item) => {
      const content = [item.topic, item.subtopic, item.details]
        .map((value) => String(value || "").trim())
        .filter((value, index, array) => value && array.indexOf(value) === index)
        .join(" — ");
      return ["[ ]", item.position || "Todos", item.discipline || "Não identificada", content || "Conteúdo não detalhado", pagesText(item.source_pages)];
    });
    addSimpleTable(doc, "Edital verticalizado — checklist de estudo",
      ["OK", "Cargo", "Disciplina", "Conteúdo programático integral", "Página(s)"], rows, 7.4,
      { 0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 27 }, 2: { cellWidth: 36 }, 4: { cellWidth: 20 } });
  }

  function addAudit(doc, audit) {
    const metrics = audit.metrics || {};
    addSimpleTable(doc, "Auditoria da análise", ["Indicador", "Resultado"], [
      ["Confiança geral", audit.overall_confidence || "Não informada"],
      ["Cobertura do conteúdo programático", metrics.program_coverage || "Não medida"],
      ["Datas com referência", metrics.dates_verified || "Não medida"],
      ["Requisitos com referência", metrics.requirements_verified || "Não medida"],
      ["Referências de página", metrics.page_references_verified || "Não medida"],
      ["Campos não localizados/informados", String(metrics.not_informed_count ?? "Não medido")],
      ["Possíveis omissões detectadas", String(metrics.possible_omissions ?? "Não medido")],
    ], 8.2);
    addTextSection(doc, "Resultado da auditoria", [
      audit.summary || "Resumo da auditoria não disponível.",
      `Verificações: ${(audit.checks || []).join("; ") || "Nenhuma registrada"}.`,
      `Conflitos: ${(audit.conflicts || []).map((item) => typeof item === "string" ? item : item.description || JSON.stringify(item)).join("; ") || "Nenhum conflito explícito registrado"}.`,
    ]);
  }

  function addSimpleTable(doc, heading, columns, rows, fontSize = 8, columnStyles = undefined) {
    const body = rows.length ? rows : [["Nenhuma informação localizada.", ...Array(Math.max(0, columns.length - 1)).fill("")]];
    sectionTitle(doc, heading, 32);
    doc.autoTable({
      startY: pdfY,
      head: [columns],
      body,
      ...tableDefaults(fontSize),
      ...(columnStyles ? { columnStyles } : {}),
    });
    pdfY = Math.min(270, (doc.lastAutoTable?.finalY || pdfY) + 8);
  }

  function addTextSection(doc, heading, paragraphs) {
    sectionTitle(doc, heading, 28);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.4); doc.setTextColor(37, 48, 68);
    paragraphs.forEach((paragraph) => {
      const lines = doc.splitTextToSize(`• ${paragraph || "Não informado."}`, 174);
      const needed = lines.length * 4.8 + 5;
      ensureSpace(doc, needed);
      doc.text(lines, 16, pdfY);
      pdfY += needed;
    });
    pdfY += 2;
  }

  function sectionTitle(doc, value, minSpace = 30) {
    ensureSpace(doc, minSpace);
    doc.setTextColor(14, 29, 51); doc.setFont("helvetica", "bold"); doc.setFontSize(15.5); doc.text(value, 16, pdfY);
    doc.setDrawColor(214, 169, 40); doc.setLineWidth(.8); doc.line(16, pdfY + 4, 72, pdfY + 4);
    pdfY += 11;
  }

  function ensureSpace(doc, needed = 30) {
    if (pdfY + needed <= 266) return;
    doc.addPage();
    pdfY = 24;
  }

  function tableDefaults(fontSize = 8) {
    return {
      theme: "grid",
      styles: { fontSize, cellPadding: 2.05, overflow: "linebreak", valign: "top", textColor: [54, 61, 72] },
      headStyles: { fillColor: [14, 29, 51], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      margin: { left: 11, right: 11, top: 21, bottom: 24 },
      showHead: "everyPage",
    };
  }

  function decoratePages(doc, code) {
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      if (page > 1) {
        doc.setFillColor(246, 248, 251); doc.rect(0, 0, 210, 14, "F");
        doc.setFillColor(214, 169, 40); doc.roundedRect(8, 3, 28, 8, 2, 2, "F");
        doc.setTextColor(8, 16, 30); doc.setFont("helvetica", "bold"); doc.setFontSize(7.2); doc.text("LUCAS MPC", 22, 8.2, { align: "center" });
        doc.setTextColor(14, 29, 51); doc.setFontSize(7.2); doc.text("MENTORIA MPC — FALE COM O PROFESSOR LUCAS", 202, 6.6, { align: "right" });
        doc.setTextColor(92, 103, 123); doc.setFont("helvetica", "normal"); doc.setFontSize(6.2); doc.text("Planejamento, estratégia e acompanhamento", 202, 10.2, { align: "right" });
        if (CONFIG.mentorshipUrl && !CONFIG.mentorshipUrl.includes("SEU-LINK")) doc.link(132, 2, 71, 10, { url: CONFIG.mentorshipUrl });
      }
      doc.setFillColor(14, 29, 51); doc.rect(0, 279, 210, 18, "F");
      doc.setTextColor(243, 211, 111); doc.setFont("helvetica", "bold"); doc.setFontSize(7.7);
      doc.text(`CLIQUE AQUI PARA USAR O ${String(CONFIG.toolName || "ANALISADOR DE EDITAIS MPC").toUpperCase()}`, 105, 285.5, { align: "center" });
      doc.setTextColor(231, 236, 245); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
      doc.text("Analise gratuitamente outro edital e solicite o PDF pelo WhatsApp.", 105, 290.2, { align: "center" });
      doc.setTextColor(166, 180, 201); doc.setFontSize(6.2); doc.text(`${code} · Página ${page} de ${pages}`, 202, 294.4, { align: "right" });
      const toolUrl = window.location.origin && window.location.origin !== "null" ? `${window.location.origin}/` : "";
      if (toolUrl) doc.link(10, 280, 190, 13, { url: toolUrl });
    }
  }

  function pagesText(value) {
    const pages = Array.isArray(value) ? value : value ? [value] : [];
    const cleanPages = [...new Set(pages.map((page) => Number.parseInt(page, 10)).filter(Number.isFinite))].sort((a, b) => a - b);
    return cleanPages.length ? cleanPages.join(", ") : "Não indicada";
  }

  function safeFileName(value) { return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "Edital"; }
  function statusLabel(value) { return ({ aguardando: "Aguardando envio", baixado: "PDF baixado", enviado: "Enviado ao usuário", concluido: "Concluído" })[value] || value || "Aguardando"; }
  function formatDate(value) { return value ? new Date(value).toLocaleString("pt-BR") : "—"; }
  function setMessage(id, message, ok) { const element = $(id); element.textContent = message; element.className = `message ${ok ? "ok" : "err"}`; }
  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
})();