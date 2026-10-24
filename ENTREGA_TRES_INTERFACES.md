# COSMOS — três interfaces locais separadas

Referência: 2026-10-23, America/Sao_Paulo. Entrega local, sem commit, tag, push ou deploy. HEAD/tag v2 preservados em `2a4deec0df6635ff5ab4775b1ee7bab415962b39`. Restrições da V4 continuam vigentes.

## Abrir as telas

| Interface | URL da prévia | Captura real 3840 × 2160 |
|---|---|---|
| I-AI | http://127.0.0.1:4174/cosmos/#/i-ai | `evidencias/i-ai-4k.png` |
| Laboratório de Axiomas | http://127.0.0.1:4174/cosmos/#/lab | `evidencias/lab-4k.png` |
| Terminal comercial | http://127.0.0.1:4174/cosmos/#/terminal | `evidencias/terminal-4k.png` |

As três rotas também são reconhecidas pelo pathname no servidor de desenvolvimento com fallback SPA (`/cosmos/i-ai`, `/cosmos/lab`, `/cosmos/terminal`). Para GitHub Pages sem rewrite, os links usam hash. Não foi feito deploy nem configurada infraestrutura externa. O navegador desenhado dentro da I-AI é parte da interface: `iai.com/chat` é uma referência visual, não o endereço realmente acessado.

## Fato → fonte → limite

| Fato | Fonte | Limite |
|---|---|---|
| Três aplicações visuais em React 19.3.1; Tailwind 4.3.3; Button/Input adaptados de shadcn/ui | `src/interfaces/`, `vite.config.ts`, `src/main.tsx` | O núcleo anterior permanece Preact. `reactAliasesEnabled:false` evita fingir que Preact/compat é React. A troca de raízes desmonta uma antes de montar a outra; não migra silenciosamente o motor histórico |
| Tema exclusivo por interface, CSS com `@scope`; Tailwind sem preflight global | `src/interfaces/produtos.css` | Não leva o tema amarelo do terminal para I-AI, nem muda as telas claras do núcleo |
| I-AI clara/escura monocromática, Chrome visual, quatro sugestões, histórico de sessão, consulta e atalhos | `IAI` em `Produtos.tsx` | Sem LLM, RAG, treino ou comando `git ia` conectado. Histórico e consulta são estado local da tela, descartáveis; não são armazenados no servidor/cofre |
| Consulta “F2” retorna SHA-256 real `e58e091f…` do catálogo público histórico | `consultarCatalogoLocal`, `src/v3/catalogo.ts` | Não lê `/comprovados/`, não produz axioma nem determina verdade. Falta de correspondência retorna “não encontrado” com o limite explícito |
| Laboratório contém Induction, Noether, Conservation, grafo φ+ψ, portas AND/OR/XOR, Schrödinger, Maxwell, relatividade, série de Basel, loss e log | `Lab`, `Graficos.tsx` | Exemplos didáticos, grafo e loss identificados como referências. Nenhum Carcara/kernel foi executado para esses cartões. Indução exige caso-base além do passo; Noether tem condições de simetria contínua/on-shell; conservação exibida refere-se ao espaço-tempo plano |
| Produzir axioma salva rascunho na sessão; buscar filtra exemplos e registros públicos; triagem encontra `A` e `¬A` | `conflitosLiterais`, editor, busca e Production Log | Triagem limitada a literais simples, não solver de fórmulas gerais. Rascunhos não são assinados, admitidos ou publicados como comprovados. Cadeia/evidências/dicionário apontam às telas existentes |
| Terminal ouro/preto com moeda oficial, portfólio, gráfico canvas, book, trades e ordens de sessão | `TerminalComercial`, `GraficoMercado` | Todos os preços, saldos, APR, supply, market cap e ganhos são demonstração. Sem conector de exchange, preço público, carteira real, staking ou transferências. COSM deste projeto não é ATOM |
| Feed animado pode ser pausado; timeframe muda o gráfico; ordem simulada aparece na sessão | Componentes acima | “LIVE” qualificado como `LOCAL SIMULATION`. `CONNECTED` significa sessão local; não afirma conexão com blockchain/exchange. Sem alegação de auditoria ou canal financeiro seguro |
| Receive/Send/Stake informam indisponibilidade de operações reais; link ao cofre V4 permanece separado | `TerminalComercial` | O saldo fictício de 12.847,3921 COSM não é saldo da HD nem o supply de 1 milhão do genesis V4. Nenhuma ordem altera o cofre ou ledger V4 |
| Apenas a moeda anexada é usada nas telas e ícones ativos | `src/ui/icons/cosmos-moeda-oficial.png`, ícones públicos derivados por redução | Original preservado byte a byte, SHA-256 `ce6539f2398d5b577d0f9c7d952876f271332e05bfa755a14aa9f5beb1bb1593`. Variantes antigas continuam como arquivos históricos sem uso pelas interfaces novas; nenhuma moeda foi gerada/desenhada |

## Integrações ausentes — confirmação do proprietário

O proprietário confirmou que não há endpoint autorizado de Worker/RAG nem mercado COSM configurado. No checkout, `./comprovados/` não existe. O repositório atual é um working tree normal, não Git bare (`git rev-parse --is-bare-repository`: false). Não foi inventada pasta “fonte da verdade”, índice de comprovados ou URL de exemplo apresentada como serviço real.

`src/interfaces/config.ts` contém:

```ts
{ comprovadosPath: null, ragEndpoint: null, cosmMarketEndpoint: null, mode: 'demo-identificado' }
```

A fonte atual é o catálogo público F0–F8 existente, com separação explícita dos exemplos de ciência e de mercado. Um navegador não varre arbitrariamente uma pasta Git local. A futura integração precisa definir indexador/servidor, contrato do índice e permissões; endpoints/auth precisam vir do proprietário. Nenhum segredo Bearer foi solicitado, criado ou colocado em variável pública de frontend. O app usa Vite, não Next.js. Alterar a configuração não liga automaticamente chamadas de rede.

## Validação executada

- `evidencias/interfaces-suite.log`: **801/801 testes, 57 arquivos, 212,79 s**, zero falhas. Base 795 + seis testes de rotas/configuração/consulta/triagem/OHLC/book. Execução anterior aos últimos ajustes de aparência/atalhos/acessibilidade; não são testes automatizados de todos os fluxos React.
- `evidencias/interfaces-typecheck-final.log`: typecheck final.
- `evidencias/interfaces-build-final.log`: build final com isolamento do runtime Z3 e licenças incluídas. Sem `npm ci` ou auditoria nova. Dependências fixadas no lockfile, instalação sem scripts.
- Navegador: consulta F2 com resultado real do catálogo; troca de tema da I-AI com zero cores não cinzas na inspeção de foreground/background/borda; porta A=1/B=1 → AND=1/OR=1/XOR=0; dois rascunhos A/¬A → aviso “triagem sintática, não certificado”; ordem BUY de demonstração → registro local e confirmação de que nada foi transferido.
- Navegação React → Preact em `#/laboratorio` conferida: `Cofre: ainda não criado`, mint desabilitado. Nenhuma seed de usuário criada/exibida, nenhuma emissão V4 ou transferência executada nesta tarefa.
- `evidencias/interfaces-mobile.json`: três rotas em viewport de 390 px, sem overflow horizontal. Não é teste em celular físico.
- Capturas 4K são screenshots reais de UI, não imagens geradas por IA, redimensionamento posterior ou ilustração vetorial. Gráficos são canvas com dados demonstrativos. Override de viewport restaurado ao final.
- Uma recarga coincidiu com reinício do Vite e ativou o fallback de erro do HTML; recarga após o servidor voltar resolveu. Não foi apagado armazenamento/cofre para resolver isso.

## Preservação e operação

`evidencias/interfaces-preservacao.json`: quatro hashes v1 e original da moeda conferidos, sem re-assinatura, sem acesso a `privado/`. Exportação de build `9e4d4fd1…` e prova OTS `a8d2c0b5…` reconferidas; checkpoint raiz `842ecb72…` também preservado. As três capturas têm dimensões nativas verificadas de 3840 × 2160.

Carteira HD/secp256k1, caminho `m/44'/1'/0'/0/x`, prefixo tb1q, cifra local e guarda de loopback permanecem nos módulos V4 anteriores. A chave Ed25519 histórica continua isolada. Terminal novo não chama essas funções. OTS e âncora independente não foram consultados/publicados.

Ícones de instalação/favicon foram atualizados pela regra mais recente de usar exclusivamente a moeda oficial, substituindo a escolha anterior de C flat. Manifest e dados das fases não foram reescritos. Arquivos locais alheios ao escopo foram preservados.

Licenças/atribuições em `THIRD_PARTY_NOTICES.md` e `LICENSES/`. Fontes consultadas: [React createRoot](https://react.dev/reference/react-dom/client/createRoot), [Tailwind/Vite](https://tailwindcss.com/docs/installation/using-vite), [shadcn Button](https://ui.shadcn.com/docs/components/button), [código shadcn](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/new-york-v4/ui).
