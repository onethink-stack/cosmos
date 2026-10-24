# Cosmos v3 — interface e trava em simulação local

Data de referência: 2026-10-23, America/Sao_Paulo. Base preservada: commit `2a4deec0df6635ff5ab4775b1ee7bab415962b39`, tag `v2`. Nenhum commit/tag/push/deploy novo foi autorizado ou realizado nesta entrega.

## Escopo aprovado

O proprietário respondeu: **“Simulação local explícita, com unidades de teste e parâmetros configuráveis, sem emissão ou transferências reais.”** Isso orienta a trava e as ofertas. Não houve autorização para decidir identidade, consenso, emissão global ou custódia. Não existe acesso direto ao Meta AI/WhatsApp nesta tarefa; a decisão foi obtida pelo proprietário neste chat.

O estado econômico do prompt não corresponde ao checkout inspecionado: não foram localizados carteira HD, motor U(φ)/B_t/w_i ou escrow anteriores. Há criptografia PBKDF2/AES no projeto, mas isso não demonstra uma carteira HD implementada. Nenhuma chave privada foi gerada/importada para o sistema novo ou lida do selo histórico.

## Entregas — fato → fonte → limite

| Fato | Fonte | Limite |
|---|---|---|
| Hub preto/verde com navegação, indicadores, fluxo, ofertas de exemplo e busca; Índice com 12 cartões e filtros | `src/ui/CosmosApp.tsx`, `src/ui/v3/Terminal.tsx`, `src/ui/v3/terminal.css` | Rede não conectada, ofertas/valores identificados como demonstração. Não são live trades de uma moeda real |
| Telas por módulo: catálogo público, dicionário, planejamento de ataques/rede, inspeção de arquivos, exportação e estado dos sistemas | Componentes acima; `src/v3/catalogo.ts` | As telas não migram o editor/notas privadas do Caderno nem implementam automaticamente IA, prova formal ou rede global. Armazenamento privado existente não foi alterado |
| Busca por metadados, hash e autor só indexa campos públicos permitidos | `src/v3/catalogo.ts`, `testes/v3-catalogo-certificados.test.ts` | Fichas v1 não têm fórmula formal. Não é auditoria universal de nomes/PII; atribuições legais existentes não foram removidas. Não há leitura do cofre/IndexedDB |
| Trava consome UTXOs fictícios, devolve troco, bloqueia gasto duplo, liquida com queima ou reembolsa após prazo | `src/v3/escrowSimulado.ts`, `src/ui/v3/SimuladorTrava.tsx` | Máquina em memória, sem assinatura de transação/consenso/rede. Certificado aceito é fixture explicitamente simulada; inspeção de arquivos não libera a trava |
| Exemplo: 80 travadas, 76 pagas, 4 queimadas, com 500 bps | `testes/v3-escrow.test.ts`, `evidencias/v3-trava-simulada.png` | 1000 unidades iniciais são fixture reiniciável, sem correspondência com ativos externos ou emissão de moeda |
| Entrada web v3 não inicializa Caderno/Z3; build falha se módulos proibidos entrarem no grafo; `dist/z3` e HTML legado ausentes | `src/main.tsx`, `vite.config.ts`, `evidencias/v3-preservacao.json` | Fonte e testes históricos Z3 permanecem para preservar v2. `z3-solver` foi movido a dependência de desenvolvimento; comandos históricos do motor não foram convertidos em um novo solver |
| Adaptador local Carcara exige caminho absoluto e SHA-256 confiável do binário, regras pinadas, arquivos limitados, timeout e saída `valid` | `src/v3/carcara-node.ts`, `scripts/conferir-alethe-v3.mjs` | Sem executável configurado: `indisponivel`, não aprovado. Não foi compilado/instalado/executado Carcara real. Não é sandbox de SO ou serviço público. Conferir prova contra SMT-LIB não comprova sozinho a tradução de qualquer texto informal |
| Inspeção de `.alethe`/`.smt2` na UI calcula hashes localmente, até dois arquivos de 1 MiB | Tela Certificados | Sem upload, execução de checker ou selo “provado”. Nenhum “não segue” é inferido da ausência de prova |
| Checklist do banco global com critérios e estado de cada cenário | `CHECKLIST_BANCO_GLOBAL_V3.md` | Três notebooks físicos, consenso, restauração após power loss e rede real continuam pendentes. SUMA original não foi anexada |

## Verificação executada

- `npm.cmd run typecheck`: aprovado; log final `evidencias/v3-typecheck.log`.
- `npm.cmd run build`: aprovado com barreira de módulos legados; `evidencias/v3-build-final.log`.
- `npm.cmd test`: **781/781 testes, 55 arquivos, zero falhas, 190,92 s**; execução final em `evidencias/v3-suite-final.log`, após os ajustes de foco/metadados/service worker. Base 769 + 8 testes da trava + 4 de catálogo/rotas/checker. A execução anterior, também aprovada, está em `evidencias/v3-suite.log`.
- Testes do checker cobrem falta de configuração e hash de binário divergente. Não há evidência positiva de Carcara real nesta máquina.
- Navegador: desktop e viewport de 390 × 844; menu móvel, filtro do Índice, busca pública, foco/Escape do modal e liquidação fictícia conferidos. Captura final: `evidencias/v3-hub-final.png`. Screenshot mobile não é teste de instalação em celular físico.
- Atualização do lockfile feita offline, apenas metadados de dependência de desenvolvimento, com `--ignore-scripts --no-audit`; sem `npm ci`, dependência nova ou auditoria nova.

## Como abrir / conferir

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 4174
```

Abrir `http://127.0.0.1:4174/cosmos/#/hub` ou `#/indice`. A prévia local não é deploy. A trava está em “Ver oferta”; os botões são explicitamente de simulação. Recarregar a página reinicia as unidades fictícias.

Para o adaptador real, o operador precisa fornecer `COSMOS_CARCARA_BIN` e `COSMOS_CARCARA_SHA256` confiáveis no ambiente. Depois:

```powershell
node --experimental-strip-types --no-warnings scripts/conferir-alethe-v3.mjs PROVA.alethe PROBLEMA.smt2
```

Isso não instala Carcara, não gera prova e não conecta a UI a um servidor. Um produtor como cvc5/veriT e a vinculação registro → problema/certificado ainda precisam de integração validada por domínio. Alethe é formato; Carcara é checker, não substituto direto de todo solver.

## Preservação e pendências

`evidencias/v3-preservacao.json` confere os quatro hashes v1 e a exportação `9e4d4fd1…`. Fases, assinaturas e chave pública fixada não foram alteradas. OTS não foi atualizado: continua `enviado_calendario`, sem confirmação Bitcoin. Âncora externa continua pendente. Nenhum envio à rede de calendários ou publicação nesta tarefa.

Licenças AGPL-3.0-or-later / CC BY 4.0 e exceções já existiam em `LICENCAS.md`; atribuições foram preservadas. Esta entrega não fornece parecer jurídico ou valida as referências regulatórias citadas no prompt. Não implementa movimentação financeira real ou custódia.

Atualização de branding autorizada após a entrega: asset dourado recebido e preservado byte a byte em `src/ui/icons/moeda-cosmos.png` (960 × 960; SHA-256 `9f64ed3bbfc918be122eb8ceb8c6cd7fcd895e9b07669e4aa520f255a8428464`). Incorporado na navegação, no Hub e no Índice; `public/favicon-32x32.png` e `public/favicon.ico` gerados por redução. Ícones PWA e manifest não alterados. Build aprovado em `evidencias/v3-moeda-build.log`; conferência visual em `evidencias/v3-moeda-hub.png` e `evidencias/v3-moeda-indice.png`. A lógica da simulação não foi alterada. Suíte completa de 781 testes corresponde à execução anterior ao branding; não foi repetida para essa alteração visual. Quatro hashes v1 e exportação reconferidos e preservados após build. Nenhum commit/push/deploy.

Identidade, consenso, emissão, carteira HD, rede real, publicação, auditoria econômica/jurídica e integração formal positiva ficam explicitamente fora deste protótipo aprovado. Não se declara que as nove etapas de implantação estão encerradas.

Referências primárias consultadas: [Carcara](https://github.com/ufmg-smite/carcara/blob/main/README.md), [Alethe no cvc5](https://cvc5.github.io/docs/cvc5-1.1.2/proofs/output_alethe.html). A CLI/regras locais do projeto também foram lidas para manter compatibilidade com o pipeline histórico.

### Pack C puro recebido posteriormente
As três imagens foram salvas sem transformação em src/ui/icons/cosmos-c-gold-black.png, cosmos-c-gold-white.png e cosmos-c-black-white.png. Os arquivos recebidos têm 960 x 960 pixels (não 1024 x 1024). Dourado no preto substitui a moeda detalhada no hub, Índice e navegação; dourado no branco fica disponível para materiais claros; preto no branco origina os favicons PNG/ICO de 32 px. PWA, dados e lógica da simulação permanecem sem alteração nesta atualização. Build aprovado: evidencias/v3-c-puro-build.log. Captura: evidencias/v3-c-puro-indice.png. Sem commit/push/deploy.


### Atualização: pack plano e fontes SVG
Novos PNGs recebidos em 1024 x 1024 substituem as três variantes em src/ui/icons/. Hub/Índice usam cosmos-c-gold-black.png; favicon PNG/ICO usa cosmos-c-black-white.png; gold-white permanece disponível. Fontes cosmos-c-gold.svg e cosmos-c-black.svg salvas com a geometria textual fornecida pelo proprietário; não são vetorização dos PNGs, cujo desenho difere. A interface usa os PNGs aprovados. Build aprovado: evidencias/v3-c-flat-build.log. Captura: evidencias/v3-c-flat.png. Sem mudança de lógica, commit, push ou deploy.

