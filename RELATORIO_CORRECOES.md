# RELATÓRIO DE CORREÇÕES — Cosmos v2 local

## Atualização de fechamento dos achados da revisão

Após o snapshot histórico de 762 testes desta entrega, os ajustes Z3/SQLite e a regressão de prazo elevaram a base a 765. A revisão v2 identificou dois desvios adicionais, agora corrigidos: arrays validados por descritores sem executar getters nem aceitar lacunas/propriedades extras; e raiz vazia correta exigida na consistência Merkle e na comparação direta de checkpoints. Quatro novos casos falharam antes e passaram depois. Resultado completo atual: **769/769 testes, 53 arquivos, zero falhas, 199,26 s**, saída 0. Fontes: `RELATORIO_Z3.md`, `REVISAO_V2_ENTREGA.md`, `RELATORIO_PATCHES_V2.md`, `evidencias/v2-arrays-merkle-suite.log`. Dados v1 e provas do checkpoint foram novamente conferidos e preservados. OTS confirmado, âncora externa e limites de operação pública continuam separados desse fechamento. Nenhum commit/tag/push/deploy.

## Escopo e preservação

HEAD permanece `4160ff1ae1a0eadca1e16eaefe9d6d62684ddd50`. Nenhum commit, push, deploy ou publicação externa de checkpoint foi realizado. Alterações locais anteriores foram preservadas. Não houve troca/geração de chave do selo, reassinatura ou migração dos JSONs v1. Nenhuma moeda transferível foi implementada.

## Matriz de correções

| Achado | Severidade | Corrigido como | Teste que comprova | Impacto em hash existente | Referência |
|---|---|---|---|---|---|
| `__proto__` duplicado/propriedade herdada | Alta | Set de chaves decodificadas por objeto; `defineProperty` cria propriedade própria sem trocar protótipo | regressao-parser: duplicação, escapes e protótipo | Nenhum; bytes v1 preservados | RFC 8785 §3.1; RFC 8259 §4 |
| Inteiro inseguro arredondado | Alta | Rejeição por `Number.isSafeInteger`; mantida rejeição local anterior de ponto/expoente | regressao-parser: ±9007199254740993, limites e decimais | Nenhum | RFC 8785 §3.1, perfil de inteiros |
| Envelope externo ignorado | Alta | Lista exata de campos; valida formato, chave, fases recebidas, declaração OTS v1, resumo e campos dos elos; separa `integridadeCadeia` e `validacaoEnvelopeCompleto` | regressao-envelope: seis testes, incluindo mutações externas | Nenhum; v1 carimbo pendente é histórico | Formato v1 existente; especificacao/cosmos-v2.md |
| OTS inexistente/declaração tomada por prova | Alta | Prova real de dois calendários; parsing e vínculo pela biblioteca oficial; confirmação só com Bitcoin Core e seis confirmações | regressao-ots: vínculo, conteúdo errado, prova inválida | Nenhum; sidecars novos | opentimestamps.org; cliente Python 0.7.2, biblioteca 0.4.5 |
| Verde genérico confundido com prova | Alta | `ResultadoVerificacao` separa integridade, assinatura, prova formal, timestamp e conclusão; UI v1 mostra inconclusivo | regressao-selos | Nenhum; não reinterpretada v1 | README e spec v2 |
| Canonicalização nova/Unicode | Alta | Perfil v2 restrito JCS: ordenação UTF-16, JSON puro, inteiros seguros; NFC é restrição adicional que rejeita sem normalizar | regressao-jcs-v2: UTF-16, NFC, surrogate, duplicação, tamanho e profundidade | Somente novo formato; v1 inalterada | RFC 8785 |
| Rollback/fork/checkpoint | Alta | Árvore Merkle e provas de inclusão/consistência; comparação com checkpoint; memória local não substituída em conflito; arquivo para publicação externa futura | regressao-transparencia: árvores 1–12, prefixos, adulteração, rollback/fork | Nenhum; novo compromisso sobre registros existentes | RFC 9162 §2.1 |
| Concorrência e admissão multiusuário | Média/Alta | Ed25519 sobre registro JCS completo; SQLite WAL/FULL/BEGIN IMMEDIATE; unicidade, append-only, sequência e idempotência; API loopback com limites | regressao-admissao-v2 e regressao-api-v2: duas conexões, conflitos, auth HTTP, reconstrução, limites | Apenas v2 nova | SQLite transações; RFC 8032 |
| Evidência/objetos corrompidos | Média/Alta | SHA-256 por objeto, duas réplicas configuráveis, temporário/fsync/link atômico; leitura verifica hash e tenta outra cópia | regressao-admissao-v2: corrupção de uma/todas as réplicas; fork não grava objeto | Nenhum | especificacao/cosmos-v2.md |
| Escopo de qsqrt2 incorreto | Média | Documentado ℤ[√2], coeficientes Number seguros, BigInt intermediário e rejeição de estouro; sem racionais gerais/divisão/hasher | testes/qsqrt2.test.ts existentes + suíte completa | Nenhum; algoritmos não alterados | Documentação matemática em qsqrt2.ts |

## Testes antes das correções

- Base anterior: 728/728 em 45 arquivos.
- Parser: seis testes executados antes da correção; três falharam, reproduzindo `__proto__`, protótipo herdado e arredondamento. Após correção: seis passaram. Suíte completa: 734 passaram em 46 arquivos (176,58s), log `evidencias/v2-parser-suite.log`.
- Envelope: seis testes falharam antes; após correção, 18 testes de envelope/elos/troca passaram.
- Novas capacidades OTS, JCS, Merkle e API foram introduzidas com testes inicialmente vermelhos por ausência de implementação. Isso não é alegação de exploração de funções que ainda não existiam.
- Separação dos selos: três testes inicialmente falharam por função ausente; depois passaram.
- Revisão do ledger: teste de fork demonstrou um objeto adicional indevido antes do ajuste. Após mover a gravação para depois da verificação de conflitos, passou.

## Verificação completa e builds

Primeira execução integrada: 760 testes aprovados em 53 arquivos, zero falhas, 205,40s. Após revisão final de admissão/objetos, execução completa encerrada com código 0:

```text
Test Files  53 passed (53)
     Tests  762 passed (762)
  Start at  19:58:43
  Duration  204.25s
```

São os 728 testes da base mais 34 testes novos, sem falhas e sem testes ignorados. Log final: `evidencias/v2-suite-final.log`.

`npm.cmd run typecheck` passou. Build do site passou. Bundle Node da API passou. Uma incompatibilidade de tipo preexistente no callback WebCrypto de `testes/cadeia.test.ts` foi resolvida copiando a mensagem para um Uint8Array com ArrayBuffer próprio, sem mudar conteúdo assinado; cópia histórica do motor lógico continua intacta.

## OTS: evidência e limite real

- Alvo: `public/cosmos-502426c-resumo.txt`, resumo hexadecimal da cadeia + LF.
- SHA-256 do alvo: `02d262a9de3a63e32353a9c3a6f30fb9073a2e3481ed678ad25ae2185792330d`.
- Prova recebida: `public/cosmos-502426c-resumo.txt.ots`, 532 bytes inicialmente, dois calendários (Alice/Bob).
- Estado observado: **enviado_calendario**, vínculo válido, `confirmacaoVerificada: false`.
- Não há confirmação Bitcoin demonstrada nesta entrega. A função de verificação exige prova atualizada, Bitcoin Core local e seis confirmações, sem usar carteira ou enviar transação.
- O JSON de status é relatório operacional não autenticado; a UI não o aceita como confirmação.
- O cliente JS 0.4.9 trouxe duas vulnerabilidades críticas e foi removido. `package.json`/lockfile não mantêm essa dependência. A CLI Python falhou ao carregar DLL de carteira no Windows; a API oficial de calendário/core foi testada e usada sem esse módulo. Não houve instalação de DLL ou enfraquecimento TLS.

## Checkpoint: publicação explicitamente adiada

O proprietário escolheu **somente arquivo local; publicação posterior**. Raiz local de nove folhas: `842ecb720637b4477272c892bd4d542376a52cf1e73e9e14b62c95cfc73e841c`.

`public/cosmos-checkpoint-v1.json` contém provas de inclusão e continuidade. A home usa memória de versões anteriores neste aparelho e informa **âncora externa não configurada**. Não foi alegada independência da mesma origem. A política exige âncora anterior por canal externo autenticado; não se oferece proteção de primeiro contato sem ela. Não foi criado gist/IPFS nem alterado domínio.

## Limitações explícitas

- Novo servidor é base local experimental, não serviço público escalado: limites por IP não resolvem DDoS distribuído/Sybil e orçamento de armazenamento ainda depende do operador.
- Duas réplicas padrão são diretórios locais, não dois notebooks/provedores independentes.
- Não há kernel formal novo ou revisão humana implementados: v1 retorna `nao_aplicavel`/`inconclusivo` corretamente.
- A reconstrução admite somente prefixos revalidados; erro interrompe sem promover o restante.
- Auditoria npm final: três vulnerabilidades altas preexistentes em `braces`, `micromatch`, `vite-plugin-singlefile`; zero críticas após remover o cliente JS OTS. Não foi executado `audit fix --force`. Evidência `evidencias/v2-audit-final.json`.
- Instalação Python OTS local é dependência de desenvolvimento explicitada em `scripts/requirements-ots.txt`. Não foi instalado pacote Python global.
- A prova OTS é o único envio externo realizado, com compromisso do resumo já público; foi expressamente solicitada. O aplicativo permanece sem deploy.

## SHA-256 a preservar

| Arquivo | Valor esperado |
|---|---|
| src/dados/cadeia-F0-F4.json | aba1b7a19c4a1447bc9da61f404478ce2be79c49a896ecf80567f54dd3cb6587 |
| src/dados/cadeia-outras-F5-F8.json | 866c2bc76e65fb94186c76b72e6dbcb713ef72fff4e7a21f5b36a8b6e8edff22 |
| src/dados/elos-assinados.json | 4c19b93be7cadff2ce79a81679580e57d0865197bd607bac92700aa851676aca |
| src/dados/selo-publico.json | ab32fe665f2a980d49fda6784df97bb6b01e7d20e35b499601a5d46d46cc032a |

O arquivo exportado continua com SHA-256 `9e4d4fd13f16ff48d79ebbbb6c354bf5802374b2a2d247dc31d8d9890492f267`. O resumo da cadeia continua `4bd9026dd6ed7ea5b637788081bf553475977b22e772fc4c4dc0e550e59656ff`. São compromissos diferentes.

## Arquivos principais

- `src/motor/registro.ts`, `cadeiaCosmos.ts`, `elosCosmos.ts`: correções e escopos.
- `src/v2/canonico.ts`, `transparencia.ts`, `ledger-node.ts`, `objetos-node.ts`, `api-node.ts`: base v2.
- `src/v2/ots-node.ts`, `scripts/cosmos-ots.py`: integração oficial OTS.
- `src/ui/CheckpointCosmos.tsx`, `Inicio.tsx`, `VerificacaoCosmos.tsx`: interface local.
- `README.md`, `especificacao/cosmos-v2.md`: posicionamento e contrato versionado, orçamento zero e regras propostas de disputa.

Referências: https://www.rfc-editor.org/rfc/rfc8785.html ; https://www.rfc-editor.org/rfc/rfc9162.html ; https://www.rfc-editor.org/rfc/rfc8032 ; https://opentimestamps.org/ ; https://www.sqlite.org/lang_transaction.html

## Encerramento verificado

Os quatro SHA-256 v1 e o SHA-256 do arquivo exportado foram conferidos novamente e coincidem com a tabela. Os quatro ícones são idênticos ao HEAD. A suíte recuperada em `testes/motor-logico.test.ts` continua byte a byte igual ao HEAD original. HEAD permanece 4160ff1; nenhum arquivo foi staged/commitado/publicado por esta tarefa. Evidência visual local: `evidencias/v2-selos-local.png`.
