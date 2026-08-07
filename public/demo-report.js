window.MPC_DEMO_REPORT = {
  identification: {
    competition_name: "Concurso Público Municipal — Exemplo demonstrativo",
    agency: "Prefeitura Municipal de Exemplo",
    organizer: "Instituto Organizador Exemplo",
    notice_number: "Edital nº 01/2026",
    publication_date: "15/07/2026",
    scope: "Municipal",
    official_link: "Não informado no documento demonstrativo",
    source_pages: [1, 2]
  },
  executive_summary:
    "O edital demonstrativo prevê vagas para cargos de níveis médio e superior, com prova objetiva, avaliação de títulos para cargos específicos e cronograma sujeito a alterações. As regras de nota mínima por disciplina e de eliminação por ausência exigem atenção especial.",
  positions: [
    {
      name: "Agente Administrativo",
      vacancies: "20 vagas + cadastro reserva",
      education: "Ensino médio completo",
      requirements: "18 anos completos e demais requisitos gerais do edital",
      workload: "40 horas semanais",
      compensation: "R$ 3.250,00",
      benefits: "Vale-alimentação conforme legislação municipal",
      registration_fee: "R$ 68,00",
      source_pages: [8, 9]
    },
    {
      name: "Professor de Educação Básica",
      vacancies: "12 vagas + cadastro reserva",
      education: "Licenciatura plena na área",
      requirements: "Diploma reconhecido pelo MEC",
      workload: "30 horas semanais",
      compensation: "R$ 4.980,00",
      benefits: "Não detalhados no quadro de cargos",
      registration_fee: "R$ 92,00",
      source_pages: [10, 11]
    }
  ],
  registration: {
    start_date: "20/07/2026",
    end_date: "18/08/2026",
    payment_deadline: "19/08/2026",
    website: "Site da banca organizadora",
    exemption_period: "20/07/2026 a 22/07/2026",
    special_service: "Solicitação durante o período de inscrições",
    source_pages: [14, 15, 16]
  },
  timeline: [
    { event: "Início das inscrições", date: "20/07/2026", source_pages: [14] },
    { event: "Encerramento das inscrições", date: "18/08/2026", source_pages: [14] },
    { event: "Divulgação dos locais de prova", date: "08/09/2026", source_pages: [22] },
    { event: "Aplicação da prova objetiva", date: "13/09/2026", source_pages: [22] },
    { event: "Gabarito preliminar", date: "14/09/2026", source_pages: [31] }
  ],
  stages: [
    {
      name: "Prova objetiva",
      nature: "Eliminatória e classificatória",
      details: "50 questões de múltipla escolha. Duração de 4 horas.",
      source_pages: [24, 25]
    },
    {
      name: "Avaliação de títulos",
      nature: "Classificatória",
      details: "Aplicável somente aos cargos de professor.",
      source_pages: [36, 37]
    }
  ],
  objective_tests: [
    {
      position: "Agente Administrativo",
      discipline: "Língua Portuguesa",
      questions: "15",
      weight: "1",
      total_points: "15",
      minimum_rule: "Não zerar a disciplina",
      source_pages: [27]
    },
    {
      position: "Agente Administrativo",
      discipline: "Matemática e Raciocínio Lógico",
      questions: "10",
      weight: "1",
      total_points: "10",
      minimum_rule: "Não zerar a disciplina",
      source_pages: [27]
    },
    {
      position: "Professor de Educação Básica",
      discipline: "Conhecimentos Pedagógicos",
      questions: "15",
      weight: "2",
      total_points: "30",
      minimum_rule: "Mínimo de 50% no bloco",
      source_pages: [28]
    }
  ],
  approval_criteria: [
    { rule: "Obter pelo menos 50% da pontuação total da prova objetiva.", source_pages: [29] },
    { rule: "Não obter nota zero em nenhuma disciplina.", source_pages: [29] },
    { rule: "Será eliminado o candidato ausente ou que descumprir as regras de identificação.", source_pages: [32, 33] }
  ],
  verticalized_notice: [
    { number: 1, position: "Todos", discipline: "Língua Portuguesa", topic: "Interpretação de textos", subtopic: "Compreensão global, inferência e finalidade", source_pages: [54], priority: "A definir", status: "Não iniciado" },
    { number: 2, position: "Todos", discipline: "Língua Portuguesa", topic: "Classes de palavras", subtopic: "Emprego e efeitos de sentido", source_pages: [54], priority: "A definir", status: "Não iniciado" },
    { number: 3, position: "Agente Administrativo", discipline: "Matemática", topic: "Razão e proporção", subtopic: "Regra de três simples e composta", source_pages: [55], priority: "A definir", status: "Não iniciado" },
    { number: 4, position: "Agente Administrativo", discipline: "Matemática", topic: "Porcentagem", subtopic: "Aumentos, descontos e variações percentuais", source_pages: [55], priority: "A definir", status: "Não iniciado" },
    { number: 5, position: "Professor de Educação Básica", discipline: "Conhecimentos Pedagógicos", topic: "Legislação educacional", subtopic: "LDB e diretrizes curriculares", source_pages: [57], priority: "A definir", status: "Não iniciado" },
    { number: 6, position: "Professor de Educação Básica", discipline: "Conhecimentos Específicos", topic: "Didática", subtopic: "Planejamento, avaliação e metodologias", source_pages: [58], priority: "A definir", status: "Não iniciado" }
  ],
  attention_points: [
    { title: "Nota mínima por bloco", detail: "O cargo de professor exige 50% no bloco de conhecimentos pedagógicos.", severity: "alta", source_pages: [28, 29] },
    { title: "Prazo curto para isenção", detail: "O pedido de isenção fica disponível por apenas três dias.", severity: "média", source_pages: [15] },
    { title: "Cronograma sujeito a alterações", detail: "O candidato deve acompanhar comunicados e retificações no site da banca.", severity: "alta", source_pages: [6, 22] }
  ],
  pending_items: [
    { item: "Data da homologação final", reason: "Não foi localizada uma data definida no cronograma.", source_pages: [22] },
    { item: "Detalhamento completo dos benefícios", reason: "O quadro de cargos remete à legislação municipal.", source_pages: [8, 10] }
  ],
  audit: {
    overall_confidence: "alta",
    summary: "A estrutura principal foi localizada com referências de página. Duas informações dependem de conferência complementar.",
    conflicts: [],
    checks: [
      "Cargos separados corretamente",
      "Cronograma associado às páginas de origem",
      "Conteúdo programático localizado nos anexos",
      "Regras de aprovação destacadas"
    ]
  },
  metadata: {
    analyzed_pages: 62,
    generated_at: new Date().toLocaleString("pt-BR"),
    source_file: "edital_demonstrativo.pdf",
    demo: true
  }
};
