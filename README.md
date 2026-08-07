# Analisador Inteligente de Editais MPC — versão 2

Esta versão substitui o analisador baseado apenas em palavras-chave. A análise real é feita pela Gemini em três etapas:

1. **Extração por blocos de páginas**: cargos, datas, requisitos, etapas, provas, critérios e conteúdos com evidências.
2. **Consolidação**: remove duplicações e separa corretamente as regras de cada cargo.
3. **Auditoria**: procura conflitos, informações sem fonte e erros na verticalização.

O relatório completo fica disponível para leitura online. O usuário não recebe um botão de download direto. Ao solicitar o PDF, a ferramenta registra a análise, gera um código exclusivo e abre o WhatsApp do professor Lucas MPC.

O PDF só pode ser baixado pelo painel administrativo protegido.

## Visualizar agora sem API

Abra `public/index.html` no navegador e clique em **Ver demonstração**. A demonstração permite avaliar o design e todas as seções do relatório sem configurar a Gemini.

Ao abrir um HTML local, o navegador ou o ChatGPT pode pedir permissão para carregar bibliotecas externas. Elas são usadas para ler PDFs e executar OCR.

## Arquivos principais

- `public/index.html`: ferramenta pública.
- `public/styles.css`: identidade visual.
- `public/app.js`: upload, leitura do edital, chamadas à IA e relatório online.
- `public/config.js`: nome, WhatsApp, mentoria, logo e limites visíveis.
- `public/admin.html`: painel privado.
- `public/admin.js`: localização dos pedidos e geração do PDF.
- `netlify/functions/start-analysis.mjs`: limite diário e abertura da sessão.
- `netlify/functions/analyze.mjs`: integração protegida com a Gemini.
- `netlify/functions/request-report.mjs`: registra o pedido do PDF.
- `netlify/functions/admin-report.mjs`: acesso privado aos relatórios.
- `netlify/lib/shared.mjs`: funções comuns e armazenamento Netlify Blobs.

## Configurações que serão preenchidas depois da aprovação visual

Edite `public/config.js`:

```js
window.MPC_CONFIG = {
  toolName: "Analisador Inteligente de Editais MPC",
  professorName: "Professor Lucas MPC",
  whatsappNumber: "5511999999999",
  mentorshipUrl: "https://SEU-LINK-DA-MENTORIA.com",
  logoUrl: ""
};
```

O WhatsApp deve conter DDI e DDD, somente números. Exemplo: `5511999999999`.

A logo pode ser uma URL pública depois da publicação. Se permanecer vazia, o sistema usa a marca textual MPC.

## Configurar a Gemini sem expor a chave

A chave nunca deve ser escrita no HTML. Na Netlify, crie as variáveis de ambiente indicadas em `.env.example`:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `ADMIN_SECRET`
- `RATE_LIMIT_SALT`
- `DAILY_ANALYSES_PER_IP`
- `MAX_GEMINI_CALLS_PER_ANALYSIS`

A variável padrão do modelo está configurada como `gemini-3.6-flash`. Antes da publicação definitiva, confira no Google AI Studio se esse modelo permanece disponível no nível gratuito.

## Funcionamento gratuito

A ferramenta foi programada para interromper a análise quando a cota gratuita acabar. Ela não troca automaticamente para modelo pago.

Proteções incluídas:

- duas análises por IP por dia, ajustável;
- no máximo 26 chamadas à Gemini por análise;
- sessão com validade de 45 minutos;
- mensagem clara quando a cota retornar erro 429;
- nenhuma chave de API no navegador;
- limite de 35 MB e 350 páginas, ajustável;
- armazenamento do relatório somente quando o usuário solicita o PDF.

## Fluxo do usuário

1. Envia o edital.
2. O navegador extrai texto e executa OCR em páginas necessárias.
3. A Gemini realiza extração, consolidação e auditoria.
4. O relatório completo aparece em HTML.
5. O usuário clica em **Solicitar PDF no WhatsApp**.
6. A ferramenta registra o relatório e gera um código `MPC-XXXX-XXXX`.
7. O WhatsApp abre com concurso, arquivo e código preenchidos.
8. O professor acessa `/admin.html`.
9. Localiza o pedido pelo código.
10. Baixa o PDF e o envia ao usuário.

## Fluxo administrativo

No painel privado é possível:

- listar solicitações;
- buscar por código, arquivo ou concurso;
- visualizar o resumo do relatório;
- gerar o PDF completo;
- marcar o pedido como baixado, enviado ou concluído.

A senha administrativa é validada na função da Netlify. O relatório não é retornado sem a senha correta.

## PDF gerado pelo painel

O PDF contém:

- capa;
- identificação do concurso;
- resumo executivo;
- cargos, vagas e requisitos;
- inscrições e cronograma;
- etapas e estrutura das provas;
- critérios de aprovação;
- edital verticalizado;
- pontos de atenção e pendências;
- auditoria;
- logo textual no canto superior esquerdo;
- anúncio da mentoria no canto superior direito;
- chamada clicável para a ferramenta em todas as páginas.

## Testar localmente com a API

Para a análise real, não basta abrir o HTML como arquivo. As funções precisam rodar por meio do Netlify CLI:

```bash
npm install
npm install -g netlify-cli
netlify dev
```

Depois, abra o endereço local informado pelo Netlify CLI. As variáveis devem estar em um arquivo `.env` local ou configuradas no projeto Netlify.

## Limitações honestas

- A precisão depende da qualidade do texto ou OCR do edital.
- Tabelas muito complexas podem exigir conferência.
- O relatório deve ser comparado com o edital oficial e suas retificações.
- O nível gratuito da Gemini possui limites e pode ser alterado pelo Google.
- O usuário consegue ler e copiar as informações exibidas online, mas não recebe o arquivo PDF gerado pelo painel.
- Editais públicos enviados no nível gratuito podem ser usados pelo provedor para melhorar produtos; o aviso está presente antes da análise.
