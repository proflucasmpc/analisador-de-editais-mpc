(() => {
  "use strict";
  const CONFIG = window.MPC_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  let secret = "";
  let records = [];
  let selected = null;

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
    records = records.map((item) => item.code === code ? {
      ...item, status: selected.status, updatedAt: selected.updatedAt,
    } : item);
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
    addIdentification(doc, report);
    addTextPage(doc, "Resumo executivo", [report.executive_summary || "Resumo não disponível."]);
    addPositions(doc, report.positions || []);
    addRegistration(doc, report.registration || {});
    addTimeline(doc, report.timeline || []);
    addStages(doc, report.stages || []);
    addTests(doc, report.objective_tests || []);
    addSimpleTable(doc, "Critérios de aprovação e eliminação", ["Regra", "Páginas"],
      (report.approval_criteria || []).map((item) => [item.rule, pagesText(item.source_pages)]));
    addVerticalized(doc, report.verticalized_notice || []);
    addSimpleTable(doc, "Pontos que exigem atenção", ["Ponto", "Detalhamento", "Gravidade", "Páginas"],
      (report.attention_points || []).map((item) => [item.title, item.detail, item.severity, pagesText(item.source_pages)]));
    addSimpleTable(doc, "Pendências e conferências necessárias", ["Item", "Motivo", "Páginas"],
      (report.pending_items || []).map((item) => [item.item, item.reason, pagesText(item.source_pages)]));
    addAudit(doc, report.audit || {});
    addTextPage(doc, "Aviso final", [
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
    doc.setFontSize(16); const title = doc.splitTextToSize(id.competition_name || record.competitionName || "Concurso não identificado", 175); doc.text(title, 16, 121);
    doc.setTextColor(173, 187, 207); doc.setFontSize(10.5);
    const y = 153 + Math.max(0, title.length - 1) * 7;
    doc.text(`Edital: ${id.notice_number || "Não identificado"}`, 16, y);
    doc.text(`Órgão: ${id.agency || "Não identificado"}`, 16, y + 10);
    doc.text(`Banca: ${id.organizer || "Não identificada"}`, 16, y + 20);
    doc.text(`Código do pedido: ${record.code}`, 16, y + 30);
    doc.setFillColor(14, 29, 51); doc.roundedRect(16, 214, 178, 39, 4, 4, "F");
    doc.setTextColor(243, 211, 111); doc.setFontSize(13); doc.text("Inclui edital verticalizado", 25, 229);
    doc.setTextColor(225, 232, 243); doc.setFontSize(9.5);
    doc.text(doc.splitTextToSize("Cargos, datas, etapas, critérios, pontos de atenção e conteúdos programáticos organizados com referências de página.", 158), 25, 240);
  }

  function addIdentification(doc, report) {
    const id = report.identification || {};
    doc.addPage(); title(doc, "Identificação do concurso");
    const rows = [
      ["Concurso", id.competition_name, pagesText(id.source_pages)], ["Órgão", id.agency, pagesText(id.source_pages)],
      ["Banca", id.organizer, pagesText(id.source_pages)], ["Número do edital", id.notice_number, pagesText(id.source_pages)],
      ["Data de publicação", id.publication_date, pagesText(id.source_pages)], ["Abrangência", id.scope, pagesText(id.source_pages)],
      ["Link oficial", id.official_link, pagesText(id.source_pages)],
    ];
    doc.autoTable({ startY: 31, head: [["Campo", "Informação", "Páginas"]], body: rows, ...tableDefaults() });
  }

  function addPositions(doc, items) {
    addSimpleTable(doc, "Cargos, vagas e requisitos",
      ["Cargo", "Vagas", "Escolaridade", "Requisitos", "Jornada", "Remuneração", "Taxa", "Páginas"],
      items.map((item) => [item.name, item.vacancies, item.education, item.requirements, item.workload, [item.compensation, item.benefits].filter(Boolean).join(" · "), item.registration_fee, pagesText(item.source_pages)]),
      6.4
    );
  }

  function addRegistration(doc, item) {
    addSimpleTable(doc, "Inscrições, pagamento e isenção", ["Campo", "Informação", "Páginas"], [
      ["Início", item.start_date, pagesText(item.source_pages)], ["Encerramento", item.end_date, pagesText(item.source_pages)],
      ["Pagamento", item.payment_deadline, pagesText(item.source_pages)], ["Site", item.website, pagesText(item.source_pages)],
      ["Isenção", item.exemption_period, pagesText(item.source_pages)], ["Atendimento especial", item.special_service, pagesText(item.source_pages)],
    ]);
  }

  function addTimeline(doc, items) {
    addSimpleTable(doc, "Cronograma", ["Evento", "Data ou período", "Páginas"], items.map((item) => [item.event, item.date, pagesText(item.source_pages)]));
  }

  function addStages(doc, items) {
    addSimpleTable(doc, "Etapas do concurso", ["Etapa", "Natureza", "Detalhamento", "Páginas"], items.map((item) => [item.name, item.nature, item.details, pagesText(item.source_pages)]));
  }

  function addTests(doc, items) {
    addSimpleTable(doc, "Estrutura das provas", ["Cargo", "Disciplina", "Questões", "Peso", "Pontos", "Regra mínima", "Páginas"],
      items.map((item) => [item.position, item.discipline, item.questions, item.weight, item.total_points, item.minimum_rule, pagesText(item.source_pages)]), 7
    );
  }

  function addVerticalized(doc, items) {
    addSimpleTable(doc, "Edital verticalizado", ["Nº", "Cargo", "Disciplina", "Assunto", "Subassunto", "Páginas", "Prioridade", "Status"],
      items.map((item, index) => [item.number || index + 1, item.position, item.discipline, item.topic, item.subtopic, pagesText(item.source_pages), item.priority || "A definir", item.status || "Não iniciado"]), 6.6
    );
  }

  function addAudit(doc, audit) {
    addTextPage(doc, "Auditoria da análise", [
      `Confiança geral: ${audit.overall_confidence || "Não informada"}.`,
      audit.summary || "Resumo da auditoria não disponível.",
      `Verificações: ${(audit.checks || []).join("; ") || "Nenhuma registrada"}.`,
      `Conflitos: ${(audit.conflicts || []).join("; ") || "Nenhum conflito explícito registrado"}.`,
    ]);
  }

  function addSimpleTable(doc, heading, columns, rows, fontSize = 8) {
    doc.addPage(); title(doc, heading);
    const body = rows.length ? rows : [["Nenhuma informação localizada.", ...Array(Math.max(0, columns.length - 1)).fill("")]];
    doc.autoTable({ startY: 31, head: [columns], body, ...tableDefaults(fontSize) });
  }

  function addTextPage(doc, heading, paragraphs) {
    doc.addPage(); title(doc, heading); let y = 37;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(37, 48, 68);
    paragraphs.forEach((paragraph) => {
      const lines = doc.splitTextToSize(`• ${paragraph || "Não informado."}`, 174);
      if (y + lines.length * 5.2 > 267) { doc.addPage(); title(doc, `${heading} — continuação`); y = 37; }
      doc.text(lines, 16, y); y += lines.length * 5.2 + 5;
    });
  }

  function title(doc, value) {
    doc.setTextColor(14, 29, 51); doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.text(value, 16, 22);
    doc.setDrawColor(214, 169, 40); doc.setLineWidth(.9); doc.line(16, 26, 72, 26);
  }

  function tableDefaults(fontSize = 8) {
    return {
      theme: "grid",
      styles: { fontSize, cellPadding: 2.1, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [14, 29, 51], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      margin: { left: 11, right: 11, top: 28, bottom: 24 },
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
        doc.setTextColor(14, 29, 51); doc.setFontSize(7.2); doc.text("MENTORIA PARA CONCURSOS", 202, 6.6, { align: "right" });
        doc.setTextColor(92, 103, 123); doc.setFont("helvetica", "normal"); doc.setFontSize(6.2); doc.text("Planejamento, estratégia e acompanhamento", 202, 10.2, { align: "right" });
        if (CONFIG.mentorshipUrl && !CONFIG.mentorshipUrl.includes("SEU-LINK")) doc.link(143, 2, 60, 10, { url: CONFIG.mentorshipUrl });
      }
      doc.setFillColor(14, 29, 51); doc.rect(0, 279, 210, 18, "F");
      doc.setTextColor(243, 211, 111); doc.setFont("helvetica", "bold"); doc.setFontSize(7.7);
      doc.text(`CLIQUE AQUI PARA USAR O ${String(CONFIG.toolName || "ANALISADOR DE EDITAIS MPC").toUpperCase()}`, 105, 285.5, { align: "center" });
      doc.setTextColor(231, 236, 245); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
      doc.text("Com essa ferramenta, você consegue analisar qualquer edital com apenas um clique.", 105, 290.2, { align: "center" });
      doc.setTextColor(166, 180, 201); doc.setFontSize(6.2); doc.text(`${code} · Página ${page} de ${pages}`, 202, 294.4, { align: "right" });
      const toolUrl = window.location.origin && window.location.origin !== "null" ? `${window.location.origin}/` : "";
      if (toolUrl) doc.link(10, 280, 190, 13, { url: toolUrl });
    }
  }

  function pagesText(value) {
    const pages = Array.isArray(value) ? value : value ? [value] : [];
    return pages.length ? pages.join(", ") : "Não indicada";
  }
  function safeFileName(value) { return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "Edital"; }
  function statusLabel(value) { return ({ aguardando: "Aguardando envio", baixado: "PDF baixado", enviado: "Enviado ao usuário", concluido: "Concluído" })[value] || value || "Aguardando"; }
  function formatDate(value) { return value ? new Date(value).toLocaleString("pt-BR") : "—"; }
  function setMessage(id, message, ok) { const element = $(id); element.textContent = message; element.className = `message ${ok ? "ok" : "err"}`; }
  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
})();
