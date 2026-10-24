# P1 — Groq na ponte local

## Escopo

Implementação local sobre P0, sem alterar seu catálogo/contratos congelados. Configuração Groq versionada `cosmos-groq-p1-v1`, independente do estado simulado. Sem commit, push, deploy ou instalação de dependências. Nenhuma chave real foi lida pelo executor; não foi realizada inferência na Groq. Todos os testes do provedor usam chave fictícia e transporte mockado.

O processo confiável pode habilitar o adaptador real com:

```text
node scripts/integracoes-p0.mjs --groq
```

Sem `--groq`, a instância permanece P0 sem provedor externo; as rotas Groq respondem indisponível. O launcher não lê dotenv nem inclui variáveis de ambiente no build (`envDir:false`, `envPrefix:[]`). O resolver `() => process.env.GROQ_API_KEY` é criado no runtime Node, depois do build, e chamado somente ao testar/executar. Não imprimir/exportar a variável, colar a chave na interface ou fornecer a chave ao agente. A chave deve ser configurada pelo proprietário no ambiente do processo confiável.

## Entrega

| Arquivo | Responsabilidade |
|---|---|
| `src/integracoes/groq-contratos.ts` | Catálogo público fechado, configuração e validação do snapshot P1, sem credencial |
| `src/integracoes/provedores/groq.ts` | POST HTTPS fixo, pedido reconstruído, sem ferramentas/redirect/retry, deadline e resposta limitada |
| `src/integracoes/groq-node.ts` | Configuração/estado voláteis, capacidade P0, revisão, cancelamento, admissão e consumo real/conservador |
| `src/integracoes/ponte-node.ts` | Mesma fronteira IPv4/Host/Origin/marcador; dispatch fechado P1; segredo somente no processo |
| `src/interfaces/groq-cliente.ts` | Transporte same-origin sem Authorization/storage, snapshot validado, deadline e tamanho limitados |
| `src/interfaces/GroqIntegracao.tsx` | Salvar/Testar/Desativar Groq, estado explícito, modelo fechado, usage e reservas |
| `src/interfaces/Integracoes.tsx`, `integracoes.css` | Seleção P0/P1 e apresentação separada |
| `scripts/integracoes-p0.mjs` | Habilitação explícita por `--groq`, segredo somente em runtime Node |
| `testes/integracoes-groq.test.ts` | Validação, upstream mockado e fronteira HTTP com API P0/ponte reais em loopback |

## Fontes e modelos

Verificados na documentação oficial em 23/10/2026:

- [Modelos Groq](https://console.groq.com/docs/models): `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`. Os prefixos são parte dos IDs reais. Não se envia o apelido `groq/gpt-oss-120b` para a API.
- [API Chat Completions](https://console.groq.com/docs/api-reference): `POST https://api.groq.com/openai/v1/chat/completions`. Host derivado desse destino HTTPS fixo; cliente não escolhe URL, porta ou cabeçalhos de autenticação.
- [Limites Free](https://console.groq.com/docs/rate-limits): referência por modelo/organização de 30 RPM, 1.000 RPD, 8.000 TPM, 200.000 TPD. Conta e disponibilidade efetivas prevalecem. O software não consegue comprovar o plano da chave nem garantir custo zero. Use conta Free e limites de gastos definidos pelo proprietário no provedor.

## Fronteira e rotas

Todas passam ANTES pelo controle da ponte: socket IPv4 literal `127.0.0.1`, Host da origem dedicada, `X-Cosmos-P0:1`, Origin canônico. GET sem Origin exige Fetch Metadata same-origin e Referer dessa origem. Rejeita duplicatas críticas, Cookie/Authorization do navegador, Forwarded/X-Forwarded, compressão e queries/caminhos arbitrários. Sem CORS ou endpoint de bootstrap/diagnóstico.

- `GET/PUT /cosmos/__p0/groq/configuracao`: configuração somente em memória. Revisão inicial 1, incremento exato, replay idêntico não chama provedor.
- `GET /cosmos/__p0/groq/estado`: estado e consumo sem segredo, prompt ou resposta.
- `POST /cosmos/__p0/groq/testar`: sem corpo; usa modelo salvo e mensagem fixa `ping: ok`, temperatura 0, teto de saída 256. O teste consome quota real quando habilitado e credenciado.
- `POST /cosmos/__p0/groq`: corpo exato `model/messages/max_tokens/temperature`. Exige configuração habilitada e modelo igual ao salvo. É capacidade para chamada explícita; não conecta automaticamente I-AI, RAG ou carteira.

Corpo máximo 16 KiB, upload absoluto 5 s, mensagens 1–20, conteúdo textual UTF-8 reversível, roles system/user/assistant, temperatura finita 0–1, saída inteira 1–8.192. Campos extras, getters e arrays com lacunas rejeitados na entrada JS direta. Não é isolamento de Proxy.

Teste/execução conferem a sessão P0 no backend antes/depois da leitura. Durante inferência, conferência periódica de capacidade cancela revogação; não renova a sessão. Encerramento da ponte, desconexão, mudança de revisão e desativação abortam pendentes. Prazo máximo do adaptador 20 s inclui headers e streaming da resposta; cliente espera no máximo 24 s. Nenhum retry automático. Janela entre revogação e cancelamento depende da conferência (~1 s + transporte loopback); dados já enviados não são recolhidos e podem consumir quota.

### Corrida de revisão reproduzida e corrigida

Na primeira versão P1, a condição de revisão era avaliada antes do `await` da conferência final. Um teste controlado trocou a configuração enquanto a conferência aguardava e reproduziu retorno indevido 200: `p1-groq-revisao-antes.log` (1 falhou, 50 filtrados). A correção confere sessão, cancelamento e identidade da configuração DEPOIS do await. Gravações também conferem a base da revisão após upload. Os testes focados posteriores passaram; o teste não revela falha anterior no P0.

A primeira tentativa de suíte completa foi interrompida pelo agente para concluir essa revisão; `p1-groq-suite-interrompida-para-revisao.log` não é uma execução verde ou uma falha concluída da suíte.

## Medição e limites

- P0 mantém bytes simulados e quotas anteriores intactos.
- P1 mantém uma execução simultânea, admissão local limitada e reservas por minuto/dia. Reserva entrada por bytes + margem por mensagem + teto de saída; é estimativa conservadora, não tokenizer ou garantia de custo.
- `usage.prompt_tokens/completion_tokens/total_tokens` precisa conter inteiros seguros coerentes; retorno incompatível não cria medição real fictícia.
- Uso confirmado reconcilia reserva mesmo se uma revisão mudou depois do envio. Falha, timeout, cancelamento ou 429 sem usage mantém reserva separada dos tokens efetivamente medidos. Não se declara custo zero quando faltou medição.
- Desativar/editar não zera consumo. Contadores são voláteis e não cobrem outros processos/apps/contas. Reinício não renova quota do provedor. Janela diária local não equivale ao relógio da organização Groq.
- Tetos locais e a admissão da API P0 podem ser mais restritivos que a referência Free. Uma solicitação de 8.192 tokens é válida no schema, mas será recusada pela reserva de 8.000 TPM antes da rede.
- Configuração tem replay idempotente; chamadas de inferência são pedidos explícitos distintos. Não há idempotência remota garantida. Após falha, a UI consulta somente estado, sem repetir o ping.

## Respostas e observabilidade

Upstream limitado a 128 KiB inclusive sem Content-Length. Redirects e resposta incompatível recusados. Só retornam texto final e usage validados; reasoning, extensões, headers Set-Cookie/Location, IDs e mensagens de erro brutas não são repassados. Resposta que reflita literalmente a credencial é recusada. Erros são classes estáticas; 401/403 Groq viram configuração inválida, distintos da capacidade local expirada.

Não há logs de prompts/respostas/chave, arquivos de credenciais ou storage de navegador. `observabilidade-node.ts` permanece inalterado. Tráfego real Groq não é registrado como evento simulado P0; não foi criado endpoint público ou coletor P1 de conteúdo. `Cache-Control:no-store` regula o transporte local, não promete a política de retenção do provedor.

## Validação

- Focados iniciais: **47/47**, `p1-groq-testes-inicial.log`.
- Focados finais P0/P1 após correção da corrida: **130/130, 4 arquivos, 9,90 s**, saída 0; `p1-groq-testes-focados-final.log`. São 51 testes Groq + 79 testes API/ponte/observabilidade existentes.
- Typecheck: **aprovado**, `p1-groq-typecheck-final.log`. A primeira tentativa em sandbox sofreu `EPERM lstat C:\Users\gusta`, preservada em `p1-groq-typecheck-inicial.log`; a execução válida usou o executor Node autorizado.
- Suíte completa: `npm.cmd test -- --maxWorkers=1` — **995/995, 65/65 arquivos, nenhum pulado, 270,20 s**, saída 0, início 23:00:10; `p1-groq-suite-completa-final.log`. Soma: 944 anteriores + 51 novos. Avisos SQLite experimentais permanecem no log. Não prova eliminação definitiva de intermitência Z3 ou instalação limpa.
- Dois builds Vite aprovados com `envDir:false, envPrefix:[]`, primeiro modo `arquivo`, depois site; `p1-groq-build.log`. Na conferência visual em tela estreita, foi identificado e corrigido somente CSS de quebra/grid dos botões e selects. Os dois builds foram repetidos e aprovados: `p1-groq-build-final.log`; aviso de chunk >500 KiB mantido.
- A suíte e o typecheck completos precedem esse último ajuste exclusivamente CSS. `p1-groq-conferencia-pos-css.json` comprova **9/9 arquivos de lógica/teste/launcher idênticos aos validados**, com diferença apenas em `src/interfaces/integracoes.css`. Não se apresenta o teste como posterior à mudança de estilo. Inventário final: `p1-groq-inventario-pos-css.json`.
- **13/13 hashes protegidos idênticos** ao P0, antes e depois dos builds; `p1-groq-preservacao-antes-build.json` e `p1-groq-preservacao-final.json`. Inclui config.ts, contratos/política P0, histórico/assinaturas/selo, moeda, exportação, package e lockfile.
- Fluxo manual em navegador real: alternar P0/P1 → Groq sem configuração → Salvar → Local ainda não testado, todos os consumos zero → Desativar → teste bloqueado. **Não foi clicado Testar Groq**, nem consultada chave real ou inferência. Evidências `p1-groq-interface.png` e `p1-groq-interface-desativada.png`.
- Prévia temporária reaberta em `http://127.0.0.1:4175/cosmos/#/integracoes`, com `--groq`. Configuração salva somente em memória e deixada **desativada** após conferência; sessão de 15 minutos sem renovação automática. Não é deploy ou serviço persistente.
- HEAD preservado: `2a4deec0df6635ff5ab4775b1ee7bab415962b39`; índice Git sem alteração. O checkout já contém outros trabalhos locais; o inventário não autoriza staging ou publicação.

## Limites mantidos

Sem alteração de `src/interfaces/config.ts`, contratos/política P0, histórico F0-F8, assinaturas, chave pública, moeda oficial, package/lockfile ou exportação assinada. Sem RAG externo ou fontes privadas, ferramentas, login de servidor, consenso, rede financeira, OTS ou âncora pública. Chaves históricas e carteira permanecem isoladas.
