# P0 / Tarefa 4 — orçamento, idempotência e cancelamento

## Entrega

| Arquivo | Implementação |
|---|---|
| `src/integracoes/orcamento-node.ts` | Reserva síncrona antes do despacho; reconciliação única; contadores de sessão, concorrência e janela móvel de 60 segundos |
| `src/integracoes/execucao-node.ts` | Executor exclusivamente simulado; chave de idempotência e hash do pedido/configuração; cancelamento e prazo; resultado e uso explícitos |
| `src/integracoes/api-node.ts` | Rotas autenticadas de orçamento/execução/cancelamento; vínculo com sessão e configuração; expiração ativa da sessão |
| `testes/integracoes-orcamento.test.ts` | 18 testes de contabilidade, estimativa, replay, conflitos, falha, timeout e cancelamento |
| `testes/integracoes-api.test.ts` | 10 testes HTTP adicionais da T4; preserva os 37 anteriores |

Nenhuma mudança em contratos/política da T1 ou nos adaptadores da T3. Arquivos novos independentes dos formatos históricos, carteira e ledger v2. Não há leitura de `.env`, credencial, cofre, `privado/`, nem acesso a provedor ou rede de saída.

## Semântica do orçamento

- Escopo: uma sessão efêmera da instância local. Não é saldo financeiro, quota contratada, faturamento ou controle distribuído. Tudo em memória.
- O executor calcula a reserva como bytes UTF-8 da entrada + teto solicitado de saída, limitado pelos tetos da configuração. Esse critério é `bytes-utf8-simulados`, não tokenização real, garantia universal de contagem de tokens ou estimativa de preço.
- A saída é fixa (`Resposta local.`), truncada ao teto solicitado. Não interpreta a entrada, não consulta RAG nem executa ferramentas. A medição de sucesso é a soma dos bytes de entrada/saída simulados.
- Antes do despacho: reserva integral e atômica, sem await entre conferência e atualização. Recusa por quota não consome pedido nem inicia execução.
- Após sucesso: debita medição simulada e libera a diferença. A reconciliação não aceita negativo, fracionário, não finito ou uso acima da reserva. Repetição idêntica de reconciliação não duplica débito; divergência é recusada.
- Cancelamento antes do despacho libera tokens. Após despacho, falha, timeout e cancelamento conservam a reserva como `limite-conservador`, pois o uso é tratado como desconhecido. Não afirmar que houve gasto real ou que provedor externo foi estornado.
- Pedidos aceitos contam mesmo quando cancelados sem uso, evitando contornar o limite de tentativas. A janela móvel conta admissões, não pagamentos; replays não criam nova admissão.
- Limites aplicados: bytes de entrada, teto de saída, unidades totais da sessão, pedidos por sessão/minuto, concorrência e prazo. São adicionais aos limites HTTP da T2.
- Revisão de configuração, desativação e DELETE não zeram o consumo. Configuração reduzida não transforma consumo anterior em crédito. Uma sessão nova só pode ser emitida por função do processo confiável; não existe endpoint para trocar sessão e reiniciar quota.
- Mapa de idempotência limitado pelos pedidos admitidos (máximo 20 pela política T1); chaves limitadas a 64 caracteres. Não há eviction durante a sessão que permita repetir cobrança/execução sob a mesma chave.

## Idempotência e cancelamento

- Corpo de execução fechado: `{ id, entrada, maxTokensSaida }`. Campos extras, getters, protótipos herdados, tipos ou limites inválidos são recusados. A fronteira HTTP continua usando JSON estrito, limite de corpo/profundidade e prazo de leitura.
- Mesmo id e mesmo pedido/configuração compartilham promessa em andamento e resultado final, incluindo falhas/cancelamentos. Nenhum retry automático. Id com conteúdo, teto ou configuração/revisão diferente retorna conflito 409.
- O hash interno serve somente à idempotência: não é assinatura, anonimização, nova raiz histórica nem substituição de JCS v2. O mapa guarda hash, controle e resultado fixo; não guarda o texto como campo de histórico. Durante a execução, a entrada existe transitoriamente na memória do pedido/closure. Nenhuma garantia de apagamento físico da memória JS.
- Cancelamento é por id na sessão, compartilhado entre replays pendentes. Desconectar qualquer consumidor pendente cancela essa execução compartilhada. Não há cancelamento independente por assinante.
- DELETE, nova revisão, sessão revogada/rotacionada/expirada e encerramento cancelam o trabalho pendente. A expiração agora tem timer ativo e verificação monotônica antes de responder. Timers de execução são limpos na finalização.
- Revalidação da sessão e da geração da configuração antes da resposta evita publicar sucesso de execução obsoleta. Cancelamento conservador continua contabilizado mesmo quando a resposta é recusada.
- Cancelamento e prazo controlam somente esta simulação cooperativa por timers. Não são watchdog/isolamento de código bloqueante e não provam cancelamento de eventual provedor remoto.

## Rotas novas

Todas exigem a mesma fronteira Host exato + Origin canônico + Bearer efêmero. Sem CORS aberto ou bootstrap de sessão.

| Método e rota | Corpo | Resultado |
|---|---|---|
| GET `/integracoes/p0/orcamento` | Nenhum | Snapshot simulado de pedidos, ativos, unidades reservadas e debitadas |
| POST `/integracoes/p0/executar` | `id`, `entrada`, `maxTokensSaida` | Resultado simulado, revisão e uso/reconciliação |
| POST `/integracoes/p0/cancelar` | Somente `id` | Solicita cancelamento; informa se o id foi encontrado, não promete estorno |

Testes de conexão da T3 não geram conteúdo nem consomem unidades desse orçamento. Continuam sujeitos aos limites HTTP e à exclusão mútua do teste. Resultado de teste `sem-quota` permanece um cenário simulado, distinto dos erros efetivos do controlador de orçamento (`quota_tokens`, `quota_pedidos`, `limite_minuto`, `concorrencia_execucao`).

## Evidências

Comando final:

```text
npm.cmd test -- testes/integracoes-orcamento.test.ts testes/integracoes-api.test.ts testes/integracoes-provedores.test.ts testes/regressao-api-v2.test.ts testes/interfaces-produtos.test.ts --maxWorkers=1
```

Resultado: **79/79, 5 arquivos, 8,01s, saída 0**. Log: `evidencias/p0-t4-testes-final.log`.

Distribuição: 18 orçamento/executor + 47 API P0 + 6 credenciais/adaptador + 2 regressão v2 + 6 interfaces. Incremento desta tarefa: 28 testes. Execução anterior ao último caso de desconexão: 78/78; execução inicial parcial: 55/55. Nenhuma falha observada nessas execuções.

Typecheck frontend/servidor aprovado; log final: `evidencias/p0-t4-typecheck.log`. Não executados build nem suíte completa nesta tarefa; 79 não é a contagem total do projeto.

Preservação: `evidencias/p0-t4-preservacao.json` registra **13/13 SHA-256 idênticos**: os 11 arquivos conferidos na T3 + `package.json` e `package-lock.json`. Dados históricos, chave pública, moeda e exportação preservados. Não foram lidas chaves privadas.

HEAD permanece `2a4deec0df6635ff5ab4775b1ee7bab415962b39`, sem alterações no índice Git, instalação, commit, push ou deploy. Alterações locais anteriores preservadas. Nenhum servidor permanente foi iniciado; listeners apenas nos testes locais e encerrados pelos fixtures.

## Limites e próximos passos

Não implementa cobrança real, cota persistente após reinício, isolamento entre processos, multiusuário de produção, streaming, tokenizer/modelo externo ou RAG. Restrições de rede vêm do catálogo e do código fechado, não de firewall do processo. O pareamento com navegador/UI continua na T6; nenhuma credencial ou capacidade foi disponibilizada à interface.

Tarefas 5–7 não iniciadas. OTS e âncora independente históricos continuam fora desta entrega.
