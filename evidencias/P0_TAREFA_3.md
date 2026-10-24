# P0 / Tarefa 3 — credenciais e testes de conexão simulados

## Entrega e fronteira

- `src/integracoes/credenciais-node.ts`: resolução server-only vinculada ao id/revisão da configuração. Como o único provedor permitido é `simulado`, a credencial de API é explicitamente `nao-aplicavel`. Não inventa cofre nem referência de segredo inexistente. A sessão HTTP continua `nao-incluida` e a carteira `fora-do-escopo` na resposta pública.
- `src/integracoes/provedores-node.ts`: adaptador fixo sem rede, com resultados simulados `ok`, `invalido`, `indisponivel`, `sem-quota` e cenário de falha que produz `indisponivel`. Resultado e atraso são opções do processo confiável, capturadas na construção; não podem ser escolhidos pelo navegador.
- `src/integracoes/api-node.ts`: nova rota explícita `POST /integracoes/p0/testar`, sem corpo nem query, sob a mesma fronteira Host/Origin/Bearer e limites HTTP da Tarefa 2. Exige configuração habilitada. GET nessa rota retorna 405 e Allow POST.
- Nenhum listener começa ao importar. Nenhum arquivo, variável de ambiente ou credencial é consultado. Não há fetch, DNS de saída, URL de provedor, redirecionamento ou mecanismo de proxy nesses módulos. Essa restrição resulta do catálogo/código fechado, não de um firewall geral do processo.

## Estado e concorrência

- Salvar uma configuração nova continua produzindo `local`, com `teste: null`. Somente o teste explícito produz snapshot testado.
- `conectado` vem sempre acompanhado de `simulado: true`, escopo `adaptador-simulado`, id/revisão e timestamp. Não significa disponibilidade contínua, autenticação real de provedor, prova formal ou tempo autenticado por OTS.
- GET estado devolve o último snapshot. Repetição exata do PUT preserva esse snapshot, sem simular um teste novo. Nova revisão, DELETE, revogação/rotação de sessão e encerramento invalidam o resultado e cancelam espera pendente.
- Um único teste por instância pode ficar ativo; concorrente retorna 429. A espera é cancelável, limitada pelo `prazoMs` da configuração, e timeout simulado resulta em `indisponivel`. Isso não implementa reserva/reconciliação de orçamento nem garante cancelamento de um futuro provedor externo.
- Antes de publicar o resultado, a API autentica novamente e confere geração da configuração. Revisão alterada/apagada durante teste retorna 409; sessão rotacionada/expirada retorna 401. Não restaura estado apagado.
- Desconexão do cliente cancela a espera e libera a exclusão mútua. Erros públicos continuam códigos fixos; entradas recusadas não são refletidas.
- `sem-quota` é somente cenário de teste. Nenhum saldo, quota real ou faturamento é consultado.

## Validação reproduzível

Comando final:

```text
npm.cmd test -- testes/integracoes-api.test.ts testes/integracoes-provedores.test.ts testes/regressao-api-v2.test.ts testes/interfaces-produtos.test.ts --maxWorkers=1
```

Saída final do executor: **51/51 testes, 4 arquivos, 5,73s, exit 0**.

- 37 testes de API P0: 25 anteriores adaptados à nova rota + 12 casos da Tarefa 3.
- 6 testes de credenciais/adaptador: rejeição de campos secretos, accessor sem execução, saída sem fetch, parâmetros inválidos, cancelamento e configuração desativada.
- 2 regressões de API v2 e 6 de interfaces existentes.
- Total acrescentado nesta tarefa: 18 testes.

A primeira execução teve 48 aprovados e 1 timeout no teste existente da API v2, cujo prazo é 5s. O typecheck estava sendo executado em paralelo. Causa não comprovada; não se atribui definitivamente à concorrência ou SQLite. Repetição isolada: 2/2, 2,47s. Repetição final acima: todos aprovados, sem alterar o teste v2 ou seu prazo.

`npm.cmd run typecheck` aprovado. Não foram executados build nem suíte completa nesta tarefa. Não se apresenta 51 como contagem da suíte total do projeto.

## Preservação e limites

SHA-256 conferidos e idênticos à Tarefa 2: **11/11** — `src/interfaces/config.ts`, contratos/política da Tarefa 1, API/servidor v2, quatro dados históricos (F0-F4, F5-F8, elos, selo), moeda oficial e `dist/cosmos-502426c.json`.

HEAD observado: `2a4deec0df6635ff5ab4775b1ee7bab415962b39`. Nenhuma instalação, leitura de `.env`/cofre/`privado/`, provedor externo, commit, push ou deploy. Servidores de teste somente em loopback, com encerramento dos fixtures. Alterações locais anteriores preservadas.

Fora desta entrega: credenciais reais e armazenamento de segredos, exceção Ollama, orçamento da Tarefa 4, RAG, pareamento/interface da Tarefa 6, observabilidade e fechamento completo do P0. Não foi iniciada tarefa posterior.
