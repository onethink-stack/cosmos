# Encerramento da pendência Z3

Data: 2026-10-22. Alterações somente locais; sem commit, push ou deploy.

## Escopo e diagnóstico

Os relatórios anteriores registram execução serial aprovada, mas não identificam um teste intermitente específico nem demonstram uma causa única. A reserva de 2 GiB de memória WebAssembly por instância instalada e o encaminhamento dos argumentos pelo npm.ps1 são evidências compatíveis com pressão de memória/concorrência. Não há evidência de defeito criptográfico.

## Alterações

- `src/motor/z3.ts`: seed padrão explícita `random_seed = 0` em cada solver. O valor coincide com o padrão documentado do Z3; torná-lo explícito não é prova de eliminação da intermitência. Opções avançadas continuam permitindo escolher outra seed deliberadamente.
- O timeout existente de 20.000 ms por tentativa foi preservado. Prazos zero, negativos, fracionários, não finitos e maiores ou iguais a UINT32_MAX agora são rejeitados antes de criar contexto. O prazo recebido é aplicado depois das opções adicionais, impedindo que `timeout: 0` nelas desligue o limite.
- A tentativa com núcleo continua limitada a 5.000 ms, seguida de uma tentativa sem marcação quando necessário. Portanto, o prazo por tentativa não é um orçamento único para a chamada composta.
- `vite.config.ts`: `test.maxWorkers = 1`, para execução serial também sem argumentos adicionais no comando. Uma opção explícita do executor ainda pode sobrepor esse padrão.
- `testes/z3.test.ts`: dois casos novos verificam parâmetros com solver real, repetem a mesma contradição três vezes e rejeitam prazos inválidos. Os testes anteriores de problemas indecididos continuam sem converter `unknown` em prova ou refutação.

## Evidência e limites

Uma tentativa inicial incluiu `sat.random_seed`, rejeitado pelo solver desta versão. Essa opção foi removida. O log `evidencias/z3-estabilizacao-1.log` conserva o erro; não se trata de falha da implementação final.

Após a correção, `npm.cmd test -- testes/z3.test.ts testes/provas-t1.test.ts testes/registros.test.ts --maxWorkers=1` aprovou 35 testes em três arquivos, 63,30 s, saída 0. Log: `evidencias/z3-estabilizacao-2.log`.

`npm.cmd run typecheck` passou com a configuração final.

A primeira execução completa passou em 763/764 testes, 52/53 arquivos, 202,13 s. Os testes Z3 passaram; a falha foi `statement has been finalized` em `servidor/armazem.test.ts`. Esse teste criava uma conexão SQLite temporária diretamente no argumento de `respostasZ3`, sem guardar sua referência ou fechá-la explicitamente. O ajuste mantém a conexão em variável usada no `finally` e fecha o banco ao terminar. Não se atribui de forma conclusiva a falha ao GC sem reprodução controlada. O teste isolado passou (2/2, 1,16 s); nenhum código de produção SQLite foi modificado. Logs preservados: `evidencias/z3-suite-final.log` e `evidencias/z3-sqlite-isolado.log`.

Execução completa final: `npm.cmd test` (sem parâmetro de workers na linha de comando), **53 arquivos aprovados, 764 testes aprovados, zero falhas, 207,15 s, saída 0**. O runner informou 53 workers isolados criados ao longo da execução, um de cada vez conforme `maxWorkers: 1`; não são 53 simultâneos. São os 762 casos anteriores mais os dois novos de seed/prazo. Log integral: `evidencias/z3-suite-final-2.log`. O aviso `received "cleanupThread" command from terminated worker: 1` também ficou registrado, sem falha reportada pelo executor.

O build local e o typecheck passaram. O SHA-256 do exportado após build continua `9e4d4fd13f16ff48d79ebbbb6c354bf5802374b2a2d247dc31d8d9890492f267`; conferência dos quatro dados v1 e exportado em `evidencias/z3-hashes-v1.json`. HEAD permanece `4160ff1`, sem staging, commit, push ou deploy. Os relatórios anteriores de 762/762 permanecem como histórico de suas respectivas execuções.

A seed não torna tempo de parede determinístico e não resolve, por si só, alocação de memória. O timeout do solver é cooperativo: a proteção por encerramento de worker existente no aplicativo/servidor continua necessária quando o WASM não atende ao prazo. Não foi acrescentado um watchdog novo para chamadas diretas no processo de testes. Não se declara a eliminação definitiva de uma intermitência cuja reprodução isolada não foi fornecida.

Referência de parâmetros: https://microsoft.github.io/z3guide/programming/Parameters/ . A aceitação foi conferida também na versão instalada, sem atualização de dependências.

## Preservação

Os quatro SHA-256 v1 foram conferidos e continuam idênticos aos valores aprovados. Não foram alterados dados, assinaturas, chave pública fixada ou ícones. OTS permanece `enviado_calendario`; o checkpoint continua local, sem independência atribuída.

## Revisão posterior: prazo original no caminho com núcleo

A revisão detectou que a validação em `montarSolver` não cobria o prazo original de `checarZ3ComNucleo` quando havia grupos: `Math.min(Infinity, 5000)` tornava a entrada inválida um prazo aceito, e uma resposta conclusiva encerrava a função antes de validar o valor original. O teste novo reproduziu esse retorno `unsat` antes da correção (`evidencias/z3-timeout-nucleo-antes.log`).

Foi extraída a regra única `validarPrazoZ3`, aplicada tanto na entrada de `checarZ3ComNucleo`, antes do `Math.min`, quanto na construção do solver. Preserva-se o tipo `RangeError` já utilizado. O teste com grupos verifica a rejeição de `Infinity`, `Number.MAX_VALUE` e `4294967295`; passou após o patch (`evidencias/z3-timeout-nucleo-depois.log`: um teste aprovado e 23 não executados pelo filtro). O typecheck também passou. O resultado anterior de 764/764 fica preservado como histórico, sem atribuir-lhe cobertura desse novo caso.

O escopo de Git não mudou: nenhum commit ou tag foi criado. As implementações v2 continuam locais; uma futura tag da entrega v2 completa precisa apontar para um commit que inclua essa entrega, não apenas Z3 e o ajuste do teste SQLite.

Validação completa após esse patch: `npm.cmd test`, **53 arquivos aprovados, 765 testes aprovados, zero falhas, 195,96 s, saída 0**. O novo caso explica a passagem de 764 para 765. Log: `evidencias/z3-timeout-nucleo-suite.log`. Os quatro SHA-256 v1 foram novamente conferidos e permaneceram idênticos.
