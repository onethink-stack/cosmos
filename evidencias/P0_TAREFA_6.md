# P0 / Tarefa 6 — tela de Integrações e transporte local

## Entrega

| Arquivo | Resultado |
|---|---|
| `src/interfaces/Integracoes.tsx` / `integracoes.css` | Tela clara de configuração, limites, teste explícito, desativação, permissões e consumo |
| `src/interfaces/integracoes-cliente.ts` | Transporte same-origin fechado, sem token/segredo/storage, respostas limitadas e validadas |
| `src/integracoes/ponte-node.ts` | Ponte server-only para a API P0; guarda o Bearer, fixa destino IPv4 e permite somente rotas/métodos P0 |
| `scripts/integracoes-p0.mjs` | Inicialização manual da prévia compilada em 127.0.0.1:4175 + API efêmera em loopback |
| `src/interfaces/Produtos.tsx`, `src/main.tsx`, `src/ui/CosmosApp.tsx` | Rota `#/integracoes` e navegação por Configurações/Integrações |
| `testes/integracoes-ui.test.ts` | 12 testes novos de fluxo real com API simulada, ponte, sanitização e validação do cliente |

`src/interfaces/config.ts` permanece byte a byte intacto, com endpoints reais nulos. A rota adicional é interceptada na entrada do app, sem reinterpretar rotas/fases históricas. Sem edição de package/lockfile ou instalação.

## Uso local

Na pasta do projeto:

```text
node scripts/integracoes-p0.mjs
```

Abrir: `http://127.0.0.1:4175/cosmos/#/integracoes`.

O comando precisa de uma porta 4175 livre. Compila o HTML público autocontido e o backend Node em `tmp/integracoes-p0-interface` / `tmp/integracoes-p0-runtime`. Não grava a capacidade de sessão nesses artefatos: ela é gerada somente depois de importar o backend compilado. O HTML usa o modo arquivo já existente, sem service worker nem servidor de arquivos-fonte. O processo mantém uma prévia temporária; Ctrl+C encerra interface e API. Não há instalação como serviço, início automático com Windows, push ou deploy.

`envDir:false` desabilita o dotenv do Vite, e `envPrefix:[]` impede injetar variáveis VITE_* herdadas no cliente. O inicializador lê somente HTML compilado e código público; não lê `.env`, cofre, `privado/`, carteira ou chaves. Não inicia o servidor v2.

Servidor de interface: bind literal 127.0.0.1:4175, Host exato, HTML apenas em caminhos fixos; nenhum caminho de arquivo vindo do cliente. A API usa porta efêmera em 127.0.0.1. A instância anterior em 4174 não foi encerrada/modificada como processo.

## Fronteira de pareamento

- A capacidade Bearer fica exclusivamente na ponte Node. Não existe bootstrap de token, token em query, campo de senha/API key, localStorage, sessionStorage ou valor VITE_* criado por esta entrega.
- O navegador faz chamadas para `/cosmos/__p0/*` na sua origem literal atual. Recusa origens públicas, `file://` e localhost por DNS antes de chamar fetch. Em outras instâncias sem ponte, a tela informa serviço não iniciado; não inventa sucesso lendo HTML de fallback.
- Credenciais omitidas, cache no-store, redirect error, prazo de 12s, resposta máxima 32 KiB e UTF-8/JSON validado. Configuração, snapshot de estado, revisão/timestamp e orçamento são conferidos antes de apresentá-los como prontos.
- Ponte exige conexão IPv4 loopback, Host exato, `X-Cosmos-P0: 1` e Origin exato. GET do navegador pode omitir Origin: somente nesse caso exige `Sec-Fetch-Site: same-origin` + Referer da mesma origem exata. Métodos de escrita sempre exigem Origin. Header não simples torna chamada cross-origin dependente de preflight, que não é autorizado. Sem CORS aberto.
- Recusa duplicatas dos cabeçalhos conferidos, Authorization e Cookie enviados pelo navegador, contexto cross-site, Forwarded/X-Forwarded, compressão, caminhos/query arbitrários, métodos fora da lista e tamanho excedido. Somente corpo, método e content-type fixo são encaminhados; Host/Origin/Bearer da API são construídos no servidor.
- O destino do proxy é sempre `127.0.0.1:{portaApi}` fornecido pelo processo confiável. Cliente não fornece URL, host, porta ou credencial. Não copia headers arbitrários da resposta upstream (Set-Cookie/Location etc.).
- A API continua exigindo a fronteira Host/Origin/Bearer T2. A ponte delega a capacidade à origem local dedicada do navegador, não cria login de servidor ou identidade verificada. Não protege contra XSS/código malicioso dessa origem ou malware local capaz de forjar headers.
- Revogação/expiração da sessão não é renovada por endpoint. A UI manda reiniciar a instância explicitamente pelo processo local. A sessão tem a duração original de 15 min. O resultado do teste fica marcado como histórico daquele instante; não é disponibilidade contínua.

## Comportamento da UI

- Salvar configura somente memória, criando uma nova revisão na ação da UI; estado Local, sem teste válido dessa revisão. Limites inteiros/tetos e saída <= sessão são conferidos antes de salvar.
- Testar é uma ação separada, desabilitada sem configuração habilitada ou com alterações ainda não salvas. Exibe estados da T1 com sufixo simulado e data do último teste.
- Desativar grava a configuração salva com habilitada false e revisão seguinte, invalidando o teste e cancelando trabalhos pendentes pelo backend. Não zera orçamento.
- Campos de provedor/modelo/destino são catálogo fechado. Não há edição de endpoint ou credencial. Permissões bloqueadas e exclusão da carteira estão visíveis.
- Ações pendentes são serializadas na UI. Ao desmontar, AbortController interrompe o transporte; a ponte cancela a requisição upstream na desconexão, preservando as regras T3/T4. Resposta tardia não altera componente desmontado.
- Falha de transporte/sessão limpa o snapshot apresentado; não mantém um antigo resultado conectado como estado atual. Erros são mensagens locais fixas, sem refletir corpo, headers, token ou exceção de fornecedor.
- O orçamento é uma consulta dos contadores simulados da sessão. Sem execução de conteúdo, IA, negociação ou operação financeira nesta tela. Conta/cofre e carteira continuam em rota independente.
- RAG e mercado reais permanecem sem configuração. O catálogo padrão de contexto continua vazio. Abrir citações/gerar com RAG na conversa não foi implementado nesta tarefa.

## Validação

Comando selecionado:

```text
npm.cmd test -- testes/integracoes-ui.test.ts testes/integracoes-rag.test.ts testes/integracoes-orcamento.test.ts testes/integracoes-api.test.ts testes/integracoes-provedores.test.ts testes/regressao-api-v2.test.ts testes/interfaces-produtos.test.ts --maxWorkers=1
```

**116/116 testes, 7 arquivos, 9,79s, saída 0** — `evidencias/p0-t6-testes.log`. São os 104 anteriores + 12 novos da ponte/cliente. Execução inicial focada: 65/65 em 2 arquivos, 5,21s. Não é a contagem da suíte completa.

- Typecheck frontend/servidor aprovado — `evidencias/p0-t6-typecheck.log`.
- `npm.cmd run build` aprovado, modos arquivo e site — `evidencias/p0-t6-build.log`. Aviso de chunk JS >500 KiB permanece; não foi tratado como falha nem silenciado.
- Inicializador executado e sintaxe conferida. Um `node --check` inicial no sandbox recebeu EPERM em lstat do perfil; repetição autorizada fora dessa restrição passou.
- No navegador: sem configuração → Salvar/Local rev1 → Testar/Conectado simulado → Desativar rev2 → Salvar e ativar/Local rev3 → Testar. Limite de sessão 500 com saída 1024 foi recusado antes de gravar; revisão não mudou. Restaurado 20000 → Salvar/Local rev4 → Testar. Evidência visual: `evidencias/p0-t6-integracoes.png`.
- A primeira abordagem de prévia com Vite de desenvolvimento/runner SSR não respondeu de forma confiável nesta execução. Também houve tentativas com os dois runtimes locais. Não foi comprovada causa. A versão entregue usa bundle Node + servidor HTTP nativo, foi aberta no navegador e teve o fluxo acima verificado. Não afirma correção de bug do Vite ou do Node.

## Preservação e encerramento do escopo

`evidencias/p0-t6-preservacao.json`: **13/13 SHA-256 idênticos** aos fechamentos T4/T5, inclusive `src/interfaces/config.ts`, contratos/política T1, API/servidor v2, quatro históricos, moeda oficial, `dist/cosmos-502426c.json`, package e lockfile. O build não alterou o exportado histórico.

HEAD observado: `2a4deec0df6635ff5ab4775b1ee7bab415962b39`. Índice Git sem alteração. Sem instalação, commit, push, deploy ou credencial real. A prévia local dedicada está mantida temporariamente para revisão do usuário; não é serviço de produção.

Tarefa 7 (observabilidade e fechamento com regressão completa) não iniciada. OTS e âncora independente continuam fora deste trabalho.
