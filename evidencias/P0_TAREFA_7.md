# P0 / Tarefa 7 — observabilidade e fechamento local

## Estado da entrega

P0 concluído **no escopo local simulado**: contratos, fronteira HTTP, credenciais somente metadados, teste explícito, orçamento, preparação RAG com ACL, tela pareada e diagnósticos restritos ao processo confiável.

Não é integração de IA real, RAG de produção, login multiusuário, consenso, carteira/custódia, emissão ou mercado financeiro. Não autoriza abrir rede externa, publicar chave, implantar serviço ou fazer push.

## Observabilidade implementada

`src/integracoes/observabilidade-node.ts` fornece:

- Buffer de no máximo 256 eventos por componente, somente memória; capacidade validada entre 1 e 256.
- Formato `cosmos-diagnostico-p0-v1`, contexto simulado, sequência local, instante do relógio do sistema e contadores de eventos registrados/descartados. Não é timestamp autenticado, prova OTS ou log resistente a adulteração.
- Esquemas fechados com campos enumerados e números limitados. Não há string de mensagem livre. Entradas desconhecidas/excedentes são recusadas sem registrar o valor; getters, coerções de objetos numéricos e protótipos personalizados são recusados sem execução desses acessores. Não é isolamento contra Proxy/traps ou código malicioso dentro do processo.
- Snapshots e eventos reconstruídos/congelados, sem devolver o objeto recebido. Snapshot antigo não muda ao registrar novos eventos.
- Overflow remove o evento mais antigo; descarte inválido/overflow incrementa contador saturado. É histórico parcial e volátil, não uma trilha de auditoria completa ou uma fonte para reconstruir orçamento.
- Nenhuma escrita em disco, console, coletor ou rede pelo módulo. A duração HTTP é medida monotonicamente, truncada em milissegundos e limitada a 60.000 ms; não é garantia de latência exata sob suspensão do processo.

| Evento | Campos admitidos |
|---|---|
| HTTP | Canal API/ponte, classe fixa da operação, status, resultado HTTP e duração |
| Execução | Estado final, medição simulada/conservadora e unidades reservadas/debitadas |
| RAG | Apenas `fontes-encontradas` ou `inconclusivo` |
| Teste | Apenas resultado `ok`, `invalido`, `indisponivel` ou `sem-quota` |
| Serviço | Canal e estado de ciclo de vida/protocolo, sem id de instância ou sessão |

Nunca são campos do diagnóstico: corpo, pergunta, resposta, trecho de documento, credencial, Bearer, cookie, cabeçalhos, path/URL bruto, id de pedido/configuração/fonte, hash, stack ou mensagem de exceção. Uma referência de fonte vira somente a classe `fonte`; a query/path desconhecida vira `desconhecida`.

`observarHttpP0` registra finish/close uma única vez e remove os listeners. Fechamento antes de finish usa código local 499/interrompido; isso não é status retornado pelo provedor. HTTP 200 é resultado de transporte, sem implicar verdade, prova formal, conexão real ou execução concluída.

## Integração e acesso

- API e ponte têm buffers independentes, consultáveis por `diagnosticoLocal()` no controlador retornado ao processo confiável.
- `iniciarServidorIntegracoes(...)` também retorna essa função para o chamador local. Não retorna os diagnósticos ao navegador e não oferece endpoint de leitura/exportação.
- GET `/integracoes/p0/diagnostico` e `/cosmos/__p0/diagnostico` continuam 404. A fronteira Host/Origin/Bearer e a política de proxy não foram ampliadas.
- Eventos HTTP são por resposta, portanto incluem replays. Resultado/consumo de execução é registrado uma única vez por promessa original, por WeakSet, sem manter mapa extra de identificadores. Replay não duplica medição, orçamento ou conclusão.
- Conclusão de execução é observada antes da conferência final da sessão/configuração, permitindo registrar cancelamento/uso conservador mesmo quando a resposta posterior é recusada. Isso não publica resposta obsoleta nem muda regras T3/T4.
- Logs de parser usam somente um estado fixo, sem objeto de erro ou bytes recebidos. Nenhuma alteração em assinatura, chave histórica, formatos v1/v2 ou validação formal.
- A ferramenta não cria painel público, exportador, retenção durável ou monitoramento de produção. A prévia CLI continua imprimindo somente mensagens fixas de inicialização e URL local, sem Bearer.

## Testes acrescentados

14 novos: 10 unitários do diagnóstico, 3 integrações da API e 1 da ponte.

Cobrem schema/campos sensíveis, getters/coerção sem execução, ring buffer, imutabilidade, ausência de console/fetch, estados inválidos, classificação de paths sem conteúdo, finish/close sem duplicação, desconexão, replay sem duplicar consumo, timeout conservador, falhas de autenticação sem header no registro e ausência de endpoint público.

Focados:

```text
npm.cmd test -- testes/integracoes-observabilidade.test.ts testes/integracoes-ui.test.ts testes/integracoes-api.test.ts --maxWorkers=1
```

Resultado: **79/79 testes, 3 arquivos, 5,95s**, saída 0. Fonte: `evidencias/p0-t7-testes-focados.log`.

Typecheck frontend/servidor: aprovado. Fonte: `evidencias/p0-t7-typecheck.log`.

## Regressão completa — tentativas preservadas

Comando idêntico nas duas execuções:

```text
npm.cmd test -- --maxWorkers=1
```

1. `evidencias/p0-t7-suite-completa.log`: 4 arquivos falharam / 60 passaram; 932 testes aprovados, 12 não executados, total 944; 248,18s; saída 1. Falhas de inicialização WebAssembly/Z3 e falhas secundárias de cleanup com `api` não inicializado em fixtures existentes. Não é execução verde.
2. Durante a primeira execução, medição do executor mostrou FreeVirtualMemory 1.984.012 KiB (aproximadamente 1,9 GiB) e FreePhysicalMemory 2.488.136 KiB. Erros de alocação são compatíveis com pressão de memória, sem prova de causa única.
3. Foi encerrada somente a prévia P0 temporária criada pelo agente. Não foram encerrados navegador ou processos do usuário, alterados Z3/seed/timeouts, reduzidos testes, introduzido skip nem relaxada serialização.
4. Após a primeira suíte, a medição ficou em FreeVirtualMemory 3.131.652 KiB, cerca de 3,0 GiB. Fonte: `evidencias/p0-t7-memoria-apos-primeira-suite.json`. Variação não foi isolada em experimento controlado; não se atribui todo o ganho à prévia.
5. Uma suíte afetada passou isolada: **5/5, 3,70s**. Fonte: `evidencias/p0-t7-z3-isolado.log`.
6. Segunda execução completa: **944/944 aprovados, 64/64 arquivos, 0 pulados, 241,63s, saída 0**. Fonte: `evidencias/p0-t7-suite-completa-2.log`. Este é o resultado final válido.

Avisos `cleanupThread` e SQLite experimental estão preservados no log da execução verde. Não foram ocultados nem apresentados como falhas de autenticação/criptografia. O resultado verde não prova eliminação definitiva de intermitência ou independência do ambiente.

## Builds

Após a suíte, para não disputar memória com Z3, foram executados os dois builds do app via a API Vite instalada, mantendo a configuração do projeto e desabilitando dotenv/injeção de variáveis VITE_*:

```js
const { build } = await import('vite');
await build({ mode: 'arquivo', envDir: false, envPrefix: [] });
await build({ envDir: false, envPrefix: [] });
```

Ambos aprovados, saída 0. Fonte: `evidencias/p0-t7-build.log`. Typecheck foi executado separadamente antes da suíte. Não se apresenta esse comando como uma execução literal de `npm run build` nesta tarefa.

Aviso de chunk JS >500 KiB permanece. Não foi silenciado ou tratado como falha. Nenhuma instalação, `npm ci`, auditoria nova de dependências ou consulta a serviço externo foi realizada. Resultado não garante reprodutibilidade em instalação limpa.

## Preservação e inventário

- **13/13 SHA-256 idênticos antes e depois do build**: config da interface, contratos/política T1, API/servidor v2, quatro dados históricos, moeda oficial, exportação `dist/cosmos-502426c.json`, package e lockfile.
- Fontes: `evidencias/p0-t7-preservacao-antes-build.json` e `evidencias/p0-t7-preservacao-final.json`.
- `evidencias/p0-inventario-fontes-local.json` registra os hashes dos 26 arquivos de código/testes envolvidos no P0; a conferência posterior está em `evidencias/p0-t7-conferencia-inventario.json`: **26/26 idênticos**. Inclui arquivos com trabalho local anterior; não é lista para staging nem autorização de commit.
- HEAD permanece `2a4deec0df6635ff5ab4775b1ee7bab415962b39`. Índice Git sem alteração. Nada foi commitado, marcado com tag, enviado ou implantado.

## Fechamento das sete tarefas

| Tarefa | Entrega local |
|---|---|
| 1 | Contratos fechados e política sem rede |
| 2 | API loopback, capacidade efêmera e admissão limitada |
| 3 | Credenciais somente metadados e teste simulado explícito |
| 4 | Reserva, reconciliação, idempotência e cancelamento |
| 5 | Fontes públicas antes da busca, hash/versão e abstenção |
| 6 | Tela de Integrações e ponte same-origin server-only |
| 7 | Diagnósticos restritos e regressão completa verde |

Permanece fora do escopo: provedor/modelo real, segredo real, RAG de produção, fontes privadas, ACL multiusuário, login de servidor, consenso, moeda/mercado real, sincronização, produção e publicação. OTS e âncora independente históricos não foram consultados nem alterados.

A prévia dedicada pode ser reiniciada manualmente por `node scripts/integracoes-p0.mjs` e acessada em `http://127.0.0.1:4175/cosmos/#/integracoes`. Sessão/configuração/contadores são voláteis; reinício começa sem configuração. Não há renovação automática de capacidade.

Após os testes/builds, a prévia foi reaberta com o backend atualizado. Conferência pela ponte local: HTTP 200, `{"configuracao":null}`. A instância temporária está disponível para revisão; não é serviço de produção. O processo antigo em 4174 não foi encerrado.
