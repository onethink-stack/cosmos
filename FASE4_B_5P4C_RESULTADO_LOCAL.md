# COSMOS B GPU 5p/4c — Opção B preparada localmente

## Fato → fonte → limite

| Fato | Fonte local | Limite |
| --- | --- | --- |
| Ponte por máscara implementada; prova sintética de **29.073 bytes**, 203 resoluções, 57 compartilhamentos, 1.875 cortes | `FASE4_B_5P4C_PONTE_B_FINAL.ts`, `fase4-b-5p4c/sintetico/proof.alethe` | **Sintético, não GPU, não conferido pelo Carcara**. |
| 1.048.576 slots conferidos antes de qualquer corte; 75 cláusulas testemunhadas | `FASE4_B_5P4C_VALIDADOR.ts`, fixture separada `scripts/fase4-b-5p4c-fixture.mjs` | Nenhum reparo de testemunho. A fixture CPU é exclusivamente teste, não pode entrar no caminho de execução GPU. |
| Tradutor fechado de 20 variáveis/75 cláusulas; entrada de 616 bytes | `FASE4_B_5P4C_TRADUTOR.ts`, `fase4-b-5p4c/entrada.smt2`, `entrada.bin` | Aceita apenas os bytes canônicos desta nova instância, incluindo ordem e LF. |
| Kernel 64 × 16.384 grupos; saída esperada de 4.194.304 bytes | `fase4-b-5p4c/host/kernel.wgsl`, `host/src/main.rs` | Fonte adaptada; Rust/Naga não compilados nesta etapa. Executável e resultado físico ainda não existem. |
| **20/20 Node**: 12 novos + 8 de regressão 4p/3c; tipos novos/app/servidor aprovados | `evidencias/fase4-b-5p4c-testes.log`, `fase4-b-5p4c-tipos-*.log` | Não é uma nova execução da suíte Vitest completa. 1.035/1.035 e builds anteriores continuam históricos. |
| **13/13 pins**, 23 arquivos congelados 4p/3c e 14 fontes/artefatos novos conferidos antes/depois | `evidencias/fase4-b-5p4c-validacao-local.json` | Verificação local de bytes, não uma publicação ou atestação externa. |

## Pins desta instância

| Artefato | Bytes | SHA-256 |
| --- | ---: | --- |
| SMT2 | 3.423 | `bdb80f5683e3276ebb22b1154fce30d389c94e139ad6b27c110e578905ee851a` |
| Entrada | 616 | `affa7efa353813570254cfa98cab972e84889843f0cd7348962b3e76ee4813c1` |
| WGSL fonte | 756 | `31a3c66e68dcbf6401a55fd0f2736d0aadcd1f00f3b5a8d997f8d12dacb53e22` |
| Saída **sintética**, gerada apenas em memória | 4.194.304 | `d92ccfe9ce8e5614ffa10a93bd8b52502489aa005a987713622bc61d4864cfec` |
| Prova **sintética** | 29.073 | `235013e58aa06eece569b5c1395995ae78f1dfb3a52443a6a9f6f0cc2d757adf` |
| Cargo.lock, cópia byte a byte da versão já fixada | 25.590 | `9fab7f9f7917878da0adffb178bfc1145937a20b2e565cbbbb8f627cb03c7e82` |

Manifesto completo: `fase4-b-5p4c/manifesto.json`. Mantém `hostExecutavelSha256` e `saidaGpuSha256` nulos. Um novo executável deve ser construído e pinado; o executável 4p/3c não serve para esta entrada.

Revisão de layout antes da compilação: copiar o cabeçalho `vec4<u32>` do kernel antigo elevaria o alinhamento da struct para 16 e seu tamanho mínimo para **624 bytes**. O novo kernel usa `array<u32,4>`: cabeçalho 16 bytes, cláusulas alinhadas a 8, total **616**. Teste estático de regressão incluído; validação Naga/driver continua pendente.

## Como o corte funciona

1. O validador lê todos os slots e confere que o índice aponta para cláusula falsa naquela atribuição. Recusa sentinelas, índice ≥75 e tamanho divergente, inclusive no último slot. Não procura substituição.
2. A árvore usa a cláusula indicada pelo testemunho do prefixo. Se todos os seus literais já estão fixados e falsos, essa premissa vale para todas as extensões; o corte não precisa exigir índices iguais nos demais slots, que já foram validados.
3. Resolve os dois filhos quando necessário. A tabela de conclusões demonstradas tem chave `(positivos, negativos)`, não `(profundidade, atribuição)`. Reutiliza somente conclusões já derivadas com essas máscaras.
4. Premissas autorizadas vêm antes dos passos. A conclusão final é a cláusula vazia. A emissão conta bytes incrementalmente, recusa >1 MiB e mantém prazo cooperativo de 20s. A futura execução por processo deve manter o encerramento externo de 20s.

**75 cláusulas distintas não demonstram um limite de 75 passos de prova.** Aqui foram necessárias 203 resoluções. A estimativa de ~30 KiB foi confirmada por medição sintética para esta ordem fixa, não por `75×320` como limite matemático geral.

O teste de recomputação de resoluções verifica estruturalmente todos os passos emitidos, mas pertence ao mesmo checkout e não substitui o Carcara independente.

## Próxima fronteira

1. Compilar/testar Rust e Naga para o novo host, mantendo toolchain/lockfile fixados e conferindo limites de 16.384 grupos e 4 MiB no dispositivo. Não houve instalação ou compilação nesta etapa.
2. Conferir a prova sintética no Carcara Linux aprovado, com seu pin já autorizado, e negativos reais de pivô/premissa/truncamento. Não transferir automaticamente o `valid` histórico 4p/3c para 5p/4c.
3. **Somente após liberação da bancada**, executar duas vezes na Vega 8 física, sem fallback; comparar os 4 MiB e validar integralmente cada saída. Produzir prova a partir desses bytes reais e repetir Carcara/negativos com novos hashes e recibo.
4. Nenhum resultado real, pin de executável, run ID ou certificado GPU deve ser preenchido antecipadamente.

HEAD permanece `fde305b5106c23f0e4a24cb419ebb19371a89c2d`. Nenhum commit, push, merge, workflow remoto ou deploy nesta etapa. O resultado 4p/3c continua intacto. Sem leitura de segredos, alteração de `config.ts`, biblioteca de solver adicional ou ampliação de B3.

Revalidar localmente: `node --experimental-strip-types scripts/fase4-b-5p4c-validar-local.mjs`.
