# RELATÓRIO DE ERRO — Cosmos v2: parada antes de alterações

## Motivo da parada

A regra do proprietário exige parar e contatar o dono quando um erro impedir uma correção segura. A suíte completa já falha antes de qualquer correção v2, e arquivos envolvidos estão modificados localmente por trabalho anterior. Sem resolver essa linha de base, não é possível comprovar a exigência de testes completos verdes antes/depois nem atribuir novas regressões com segurança.

Nenhum arquivo de implementação, assinatura, chave, fase, ícone ou configuração foi alterado nesta tarefa. Este relatório é a única entrega escrita. Nenhum commit, push, deploy, carimbo ou nova chave foi realizado.

## Estado auditado

- HEAD: 4160ff1ae1a0eadca1e16eaefe9d6d62684ddd50.
- Comando: `npm test -- --maxWorkers=1`.
- Resultado: 3 arquivos de testes com falha, 41 passaram; 3 testes falharam, 690 passaram, 7 ignorados; 700 testes contabilizados.
- Duração informada: 61,56 segundos.
- A afirmação anterior de 15 testes aprovados referia-se a três arquivos específicos do Cosmos, não à suíte completa.

## Evidência 1 — importação incorreta em teste local preexistente

`testes/cadeia.test.ts:4` importa `conferirCadeia`, `conferirCadeiaTexto`, `compararVersoes`, `novoElo`, `paraHex`, `ZEROS`, `FORMATO_CADEIA` e `Cadeia` de `../src/motor/cadeia`.

Esse módulo é o motor de reação lógica e não exporta essas funções. A implementação de cadeia pessoal está em `src/motor/cadeiaPessoal.ts`.

Falhas observadas:

```text
TypeError: conferirCadeia is not a function
  testes/cadeia.test.ts:15:96
TypeError: conferirCadeia is not a function
  testes/cadeia.test.ts:23:29
TypeError: paraHex is not a function
  testes/cadeia.test.ts:43:21
```

O teste local tem 106 linhas adicionadas e 398 removidas em relação ao HEAD e foi substituído por testes de cadeia pessoal. A versão do HEAD testa o motor lógico. Restaurar esse arquivo apagaria trabalho local; trocar apenas sua importação corrigiria a incompatibilidade observada, mas não restauraria a cobertura substituída. Nenhuma dessas decisões foi tomada automaticamente.

## Evidência 2 — falha de infraestrutura Z3/WebAssembly

```text
FAIL testes/provas-t1.test.ts
RangeError: WebAssembly.Memory(): could not allocate memory
  node_modules/z3-solver/build/z3-built.js:617:18
  testes/provas-t1.test.ts:45:17
TypeError: Cannot read properties of undefined (reading 'em')
  testes/provas-t1.test.ts:48:27

FAIL testes/registros.test.ts
RangeError: WebAssembly.Memory(): could not allocate memory
  node_modules/z3-solver/build/z3-built.js:617:18
  testes/registros.test.ts:58:17
TypeError: Cannot read properties of undefined (reading 'em')
  testes/registros.test.ts:61:27
```

A falha secundária ocorre no encerramento após a inicialização não produzir `api`. Ainda não foi demonstrado se a falta de memória é transitória, dependente do processo, da configuração de workers ou do ambiente. Não é evidência de defeito criptográfico nem justificativa para omitir esses testes.

## Alterações locais anteriores relevantes

- `src/motor/registro.ts`: 4 linhas adicionadas, 1 removida; já rejeita ponto/expoente na leitura dos números.
- `testes/cadeia.test.ts`: 106 adicionadas, 398 removidas.
- `testes/registros.test.ts`: 5 adicionadas, 1 removida.
- `testes/ed25519.test.ts`: arquivo não rastreado preexistente.
- Há ainda entregas e especificações não rastreadas, preservadas.

## Integridade preservada — SHA-256 dos arquivos

| Arquivo | SHA-256 dos bytes |
|---|---|
| src/dados/cadeia-F0-F4.json | aba1b7a19c4a1447bc9da61f404478ce2be79c49a896ecf80567f54dd3cb6587 |
| src/dados/cadeia-outras-F5-F8.json | 866c2bc76e65fb94186c76b72e6dbcb713ef72fff4e7a21f5b36a8b6e8edff22 |
| src/dados/elos-assinados.json | 4c19b93be7cadff2ce79a81679580e57d0865197bd607bac92700aa851676aca |
| src/dados/selo-publico.json | ab32fe665f2a980d49fda6784df97bb6b01e7d20e35b499601a5d46d46cc032a |
| dist/cosmos-502426c.json | 9e4d4fd13f16ff48d79ebbbb6c354bf5802374b2a2d247dc31d8d9890492f267 |

O resumo final da cadeia `4bd9026d...` é distinto do SHA-256 dos bytes do arquivo exportado. `public/cosmos-502426c.json` não existe como arquivo fonte nesta árvore; o build gera `dist/cosmos-502426c.json` a partir de `src/dados/pacoteCosmos.ts`.

## Decisão necessária do proprietário

Confirmar o tratamento da suíte local preexistente: preservar os testes de cadeia pessoal em arquivo separado, com importação correta, e recuperar a cobertura do motor lógico sem perder o trabalho local. Depois diagnosticar a inicialização Z3 e obter uma linha de base completa verde, antes de iniciar as correções v2.

## Cuidados já identificados para a retomada

- Não normalizar bytes da v1 nem reescrever seus hashes/assinaturas.
- JCS RFC 8785 não normaliza Unicode; definir NFC como restrição adicional e explícita do perfil v2, preferencialmente rejeitando entradas fora de NFC, sem alegar que essa transformação é parte do JCS.
- OTS pendente não pode ser apresentado como confirmado. O envio ao calendário e a posterior verificação Bitcoin são estados distintos.
- Um checkpoint servido apenas pelo mesmo site não é independente. A política deve explicitar âncora externa e prova de continuidade.
- Nenhum dos itens v2 foi marcado como corrigido neste relatório.
