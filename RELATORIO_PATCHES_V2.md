# Cosmos v2 — correções da revisão R1/R2

Escopo: dois patches locais solicitados após `REVISAO_V2_ENTREGA.md`. Sem commit, tag, push ou deploy. A revisão e os diagnósticos anteriores são mantidos como histórico.

**Resultado final:** R1/R2 corrigidos com regressões; `npm.cmd test` aprovou **53 arquivos, 769 testes, zero falhas, 199,26 s, saída 0**. Log integral: `evidencias/v2-arrays-merkle-suite.log`. São os 765 casos anteriores mais quatro novos. Esse resultado substitui a contagem anterior como snapshot atual, sem alterar o histórico.

## Fato → fonte → limite

| Fato | Fonte | Limite |
|---|---|---|
| Arrays são validados por chaves próprias e descritores de todos os índices antes da leitura dos valores. Getters são rejeitados sem execução; lacunas, símbolos e propriedades extras, inclusive não enumeráveis, são recusados | `src/v2/canonico.ts`; dois testes novos em `testes/regressao-jcs-v2.test.ts` | Endurece a entrada JavaScript direta. A revisão não demonstrou exploração via JSON HTTP; o perfil continua restrito e não transforma NFC. Não é isolamento de código JavaScript arbitrário ou de traps de Proxy |
| Consistência com tamanho antigo zero exige a raiz SHA-256 vazia; se ambos forem zero, exige essa raiz nas duas posições e prova vazia | `src/v2/transparencia.ts`; teste novo de consistência vazia | Não autentica a origem das raízes. Provas válidas ainda dependem de checkpoint confiável |
| A comparação direta de checkpoints rejeita raiz incorreta para qualquer checkpoint vazio antes dos atalhos de igualdade/rollback | `avaliarCheckpoint` em `src/v2/transparencia.ts`; segundo teste novo de transparência | Não transforma checkpoint local em âncora externa. Nenhuma raiz publicada foi alterada |

## Evidência antes e depois

- Antes dos patches: quatro testes novos falharam e sete existentes passaram, total 11, em dois arquivos. Log: `evidencias/v2-arrays-merkle-antes.log`.
- Depois dos patches: 11/11 passaram nos mesmos dois arquivos, 2,11 s, saída 0. Log: `evidencias/v2-arrays-merkle-depois.log`.
- O teste de array com getter verifica que a contagem de execuções permanece zero. Outro cobre lacuna mascarada por uma chave extra, símbolos, propriedade extra não enumerável e preservação da ordem em array válido.
- Os dois testes Merkle cobrem raiz vazia correta/incorreta, troca de somente uma raiz, prova excedente, comparação direta e extensão válida a partir do vazio.
- `npm.cmd run typecheck` passou. `npm.cmd run build` e o bundle separado da API passaram. Logs de build: `evidencias/v2-arrays-merkle-build.log`, `evidencias/v2-arrays-merkle-api-build.log`. O build do site manteve seu aviso de chunk legado acima de 500 kB; não é erro de compilação.

## Diagnóstico e preservação

Comando: `node scripts/auditar-entrega-v2.mjs --apos-patch`.

Saída preservada separadamente em `evidencias/revisao-v2-diagnostico-apos-patch.json`; `evidencias/revisao-v2-diagnostico.json` permanece a reprodução anterior. O diagnóstico após patch confirmou:

- getter recusado, com zero chamadas;
- array esparso com propriedade extra recusado;
- raízes vazias incorretas recusadas;
- envelope v1 com integridade e envelope completo válidos;
- nove inclusões e oito continuidades válidas;
- raiz do checkpoint `842ecb720637b4477272c892bd4d542376a52cf1e73e9e14b62c95cfc73e841c` preservada;
- quatro SHA-256 v1 preservados, conforme diagnóstico;
- SHA-256 dos bytes da exportação após build ainda `9e4d4fd13f16ff48d79ebbbb6c354bf5802374b2a2d247dc31d8d9890492f267`;
- resumo da cadeia ainda `4bd9026dd6ed7ea5b637788081bf553475977b22e772fc4c4dc0e550e59656ff`.

OTS continua sem confirmação Bitcoin e checkpoint externo continua pendente. Permanecem os limites operacionais da revisão: API local experimental, exportação sem paginação/quotas cumulativas, durabilidade conjunta banco/objetos não ensaiada e auditoria de dependências como snapshot histórico. Fechar R1/R2 não equivale a homologar esses outros escopos.
