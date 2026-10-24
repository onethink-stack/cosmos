# P0 / Tarefa 2 - backend local com fronteira de acesso

## Entrega

- `src/integracoes/api-node.ts`: fábrica independente de API, somente memória, sem listener ao importar. A única operação de bind fornecida usa IPv4 literal `127.0.0.1`.
- `src/integracoes/servidor-node.ts`: início explícito pelo processo local confiável, encerramento e sessão efêmera. Não lê `.env`, ambiente, arquivos, cofre, carteira ou `privado/`. Não instala handlers globais nem inicia o servidor v2.
- `testes/integracoes-api.test.ts`: 25 testes novos reproduzíveis de fronteira, limites, ciclo de vida e concorrência.

## Rotas

Todas exigem Host exato da porta vinculada, Origin exato configurado no processo e `Authorization: Bearer` com capacidade efêmera da instância.

| Método | Caminho | Resultado |
|---|---|---|
| GET | `/integracoes/p0/estado` | `sem-configuracao` ou `local`, nunca `conectado` |
| GET | `/integracoes/p0/configuracao` | Configuração simulada ou null, sem segredo |
| PUT | `/integracoes/p0/configuracao` | Valida o contrato da Tarefa 1 e guarda só em memória |
| DELETE | `/integracoes/p0/configuracao` | Descarta a configuração volátil |

Não existem rotas de bootstrap/token, proxy, teste de provedor, carteira ou admissão v2 neste serviço.

## Fronteiras e limites

- Origem de desenvolvimento deve ser fornecida explicitamente, em formato canônico `http://127.0.0.1:porta`. Sem wildcard, localhost resolvido por DNS ou origens públicas.
- Sem CORS aberto; a interface ainda não foi ligada ao serviço. O transporte/pareamento de navegador e eventual proxy de desenvolvimento exigem etapa própria. Não apresentar esta entrega como login ou UI ponta a ponta.
- Emissão de sessão é função local para o chamador confiável, nunca resposta HTTP, query string ou log. Rotação, expiração monotônica e encerramento invalidam a capacidade anterior. Não usa chave da carteira nem Ed25519 histórica.
- Recusa cabeçalhos críticos duplicados, Forwarded/X-Forwarded e contexto cross-site. Não implementa confiança em proxies.
- Limites padrão: 16 KiB por corpo, profundidade JSON 8, prazo absoluto de corpo 5s, 2 requisições admitidas simultâneas, 60 requisições/minuto após validação de fronteira, 8 conexões e sessão de 15 minutos. As opções somente reduzem ou ajustam dentro dos tetos explícitos do serviço.
- Esses são limites HTTP de admissão, não orçamento de tokens, faturamento, reserva/reconciliação ou rate limit multiusuário persistente; isso pertence à Tarefa 4.
- JSON usa parser estrito existente somente como função: chaves duplicadas e inteiros inseguros são recusados. Nenhum formato histórico foi modificado.
- Repetir a configuração idêntica não altera o estado; revisão divergente/conflitante retorna 409. DELETE concorrente impede gravação atrasada de um PUT anterior.
- Sessão é conferida novamente após receber o corpo, antes de gravar. Configuração e sessão são descartadas ao encerrar. Nada é persistido em disco.
- Erros são códigos fixos e sanitizados; não refletem cabeçalhos, token, corpo ou mensagens do parser. Não há logging de requisições nem chamada a provedor, DNS de saída ou redirecionamento.
- Não é proteção contra malware local, XSS na origem autorizada, roubo da capacidade ou DoS completo. HTTP loopback não é rede pública nem auditoria independente.

## Validação executada

Comando: `npm.cmd test -- testes/integracoes-api.test.ts testes/regressao-api-v2.test.ts testes/interfaces-produtos.test.ts --maxWorkers=1`.

Resultado final do executor: **33/33 testes, 3 arquivos, 4,45s**, saída 0. São 25 novos + 2 regressões da API v2 + 6 testes de interfaces.

`npm.cmd run typecheck`: aprovado, saída 0.

Tentativas anteriores detectaram um fechamento ausente e o helper de teste que enviava cabeçalhos `undefined` em vez de omiti-los. Ambos foram corrigidos; não são apresentados como falhas de autenticação do serviço.

A API foi iniciada somente nos testes em portas temporárias de loopback e encerrada em `finally`. A regressão v2 utilizou seu fixture de SQLite temporário, sem executar `src/v2/servidor.ts` ou acessar seu caminho padrão de dados.

Não foram executados build nem suíte completa nesta tarefa. Nenhuma declaração de resultado atual 801/801, 822/822 ou de fechamento do P0 completo.

## Preservação

Conferência SHA-256: **11/11 idênticos** em relação ao estado anterior:

- `src/interfaces/config.ts`.
- `src/integracoes/contratos.ts` e `politica.ts` (Tarefa 1).
- `src/v2/api-node.ts` e `servidor.ts`.
- Quatro arquivos históricos: cadeia F0-F4, cadeia F5-F8, elos assinados e selo público.
- Moeda oficial e exportação `dist/cosmos-502426c.json`.

HEAD permanece `2a4deec0df6635ff5ab4775b1ee7bab415962b39`. Nenhuma instalação, leitura de credenciais/cofres, integração pública, commit, push ou deploy. As demais tarefas P0 não foram iniciadas.
