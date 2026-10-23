# RELATÓRIO DE BASE — desbloqueio sem iniciar Cosmos v2

## Escopo

Recuperar a cobertura substituída, corrigir a importação dos testes pessoais e diagnosticar a inicialização Z3. Nenhum arquivo de implementação da aplicação foi alterado nesta etapa. As alterações anteriores do proprietário permanecem no diretório de trabalho. Não houve commit, push, deploy, troca de chave, carimbo OTS ou início de v2.

## Recuperação dos testes

- `testes/motor-logico.test.ts`: conteúdo recuperado de `git show HEAD:testes/cadeia.test.ts`, no HEAD `4160ff1ae1a0eadca1e16eaefe9d6d62684ddd50`. Igualdade dos bytes confirmada.
- `testes/cadeia.test.ts`: trabalho local de cadeia pessoal preservado; alterado somente o destino da importação de `../src/motor/cadeia` para `../src/motor/cadeiaPessoal`.
- Os exports foram lidos diretamente: `conferirCadeia`, `conferirCadeiaTexto`, `compararVersoes`, `novoElo`, `paraHex`, `ZEROS`, `FORMATO_CADEIA` e o tipo `Cadeia` existem no módulo pessoal. Nenhuma função nova foi criada.

## Ambiente e diagnóstico Z3

- Windows, Node `v22.14.0`, arquitetura `x64`.
- `npm list z3-solver`: `z3-solver@5.2.0`.
- Runner do projeto: Vitest `5.0.3`, não Jest. Não foi instalado um runner diferente.
- O arquivo instalado `node_modules/z3-solver/build/z3-built.js` usa `INITIAL_MEMORY = 2147483648` e cria `WebAssembly.Memory` compartilhada, com tamanho inicial/máximo igual a esse valor: 2 GiB por instância. Isso não equivale ao heap JavaScript.
- Medição pontual Windows: RAM visível 15.626.832 KiB, livre 4.430.296 KiB; memória virtual total 22.972.820 KiB, livre 5.584.688 KiB; pagefile alocado 7.173 MiB. Valores são instantâneos, não limites estáticos nem medição do pico dos testes.
- Medição Node de processo auxiliar: limite de heap 2.197.815.296 bytes. Não representa o consumo dos workers do Z3.

### Encaminhamento dos argumentos no Windows

A chamada por `npm.ps1` imprimiu `vitest run testes/provas-t1.test.ts`, sem as opções solicitadas de worker/heap. A chamada nativa por `npm.cmd test -- --maxWorkers=1` imprimiu explicitamente `vitest run --maxWorkers=1`.

O caminho reproduzível escolhido é `npm.cmd` no PowerShell, equivalente ao comando npm pedido com a passagem dos argumentos preservada. O teste completo usa o ambiente padrão, sem `NODE_OPTIONS=--max-old-space-size=4096` persistente.

A reserva de 2 GiB por instância e a passagem incorreta das opções tornam pressão de memória/concorrência uma explicação compatível com as falhas anteriores. Não foi provado um defeito criptográfico, uma falha permanente específica do Windows ou uma causa única. Não foi alterada a biblioteca instalada.

## Execuções concluídas

| Comando | Resultado observado |
|---|---|
| `npm test -- testes/provas-t1.test.ts --maxWorkers=1 --logHeapUsage` via npm.ps1 | 1 arquivo, 5 testes aprovados; opções não apareceram na linha do runner e não houve métricas de heap no resultado |
| `node node_modules/vitest/vitest.mjs run testes/cadeia.test.ts testes/motor-logico.test.ts testes/registros.test.ts --maxWorkers=1 --logHeapUsage` | 3 arquivos, 38 testes aprovados; não houve `is not a function` nem falha Z3 |
| `NODE_OPTIONS=--max-old-space-size=4096` + Vitest para provas-t1 e registros, um worker e reporter verbose | 2 arquivos, 12 testes aprovados; heap reportado por teste entre 20 e 30 MB; ambiente restaurado após o comando |

A atualização de `z3-solver@latest` em branch separada era condicional à persistência da falha isolada. Essa condição não ocorreu: a versão existente passou. Não houve atualização de dependências ou alteração de lockfile.

## Validação completa

**Base verde confirmada.**

Comando no PowerShell:

```powershell
npm.cmd test -- --maxWorkers=1
```

O runner imprimiu `vitest run --maxWorkers=1`. Resultado real, código de saída 0:

```text
Test Files  45 passed (45)
     Tests  728 passed (728)
  Start at  18:22:19
  Duration  173.15s
```

Zero falhas e zero testes ignorados nesta execução. Os 28 testes recuperados do motor lógico explicam a diferença entre os 700 testes anteriores e os 728 atuais. O ambiente padrão foi usado; nenhum aumento persistente de heap foi necessário. Log integral: `evidencias/base-suite-vitest.log`.

A correção da importação e a execução serial explícita foram suficientes para esta execução completa. Isso não prova que alocações WebAssembly nunca falharão em outras condições de memória.

Os 700 testes do relatório anterior eram a contagem da árvore local antes de recuperar a suíte do motor lógico. Recuperar cobertura pode aumentar a quantidade: o total final deve ser o efetivamente informado pelo runner, não fixado artificialmente em 700.

## SHA-256 dos dados

Todos comparados com os valores fornecidos e preservados:

| Arquivo | SHA-256 |
|---|---|
| src/dados/cadeia-F0-F4.json | aba1b7a19c4a1447bc9da61f404478ce2be79c49a896ecf80567f54dd3cb6587 |
| src/dados/cadeia-outras-F5-F8.json | 866c2bc76e65fb94186c76b72e6dbcb713ef72fff4e7a21f5b36a8b6e8edff22 |
| src/dados/elos-assinados.json | 4c19b93be7cadff2ce79a81679580e57d0865197bd607bac92700aa851676aca |
| src/dados/selo-publico.json | ab32fe665f2a980d49fda6784df97bb6b01e7d20e35b499601a5d46d46cc032a |

`4bd9026d...` permanece o resumo final da cadeia, não o SHA-256 dos bytes do arquivo exportado. Nenhuma implementação JCS, normalização Unicode, alteração de parser ou regra v2 foi feita.

## Fontes técnicas consultadas

- Vitest CLI: https://vitest.dev/guide/cli.html
- Repositório oficial Z3 JavaScript: https://github.com/Z3Prover/z3/tree/master/src/api/js
- A constatação de 2 GiB se baseia no arquivo da versão efetivamente instalada, não em inferência sobre uma versão futura.

## Encerramento

Base desbloqueada. Trabalho interrompido após testes verdes e conferência final dos quatro SHA-256. Aguardam-se instruções explícitas para v2. Nenhuma correção v2 foi iniciada.
