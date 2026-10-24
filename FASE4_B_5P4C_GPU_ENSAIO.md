# 5p/4c — ensaio fisico executado, conferencia Linux pendente

Autorizacao vigente: o operador determinou prosseguir ate concluir o ensaio, com as protecoes existentes, interrompendo em risco a estrutura. Essa continuidade inclui a publicacao seletiva dos bytes publicos da GPU e a conferencia no workflow dedicado ja autorizado. Sem merge/deploy, sem ferramentas novas instaladas no Windows, sem segredos.

Base do host efetivamente executado: commit `5c7d837b85ef5c4028695a14045c97ec82ff49b1`, CI `40128153884`, artefato `12574415270`. Executavel SHA-256 `98b69259443e67dd03731dcb589c162a39ad04054bc4c68b40a77bc3872dd7a6`, conferido antes de cada processo.

## Observacao fisica

- AMD Radeon(TM) Vega 8 Graphics, `IntegratedGpu`, vendor 4098, device 5597.
- Vulkan, AMD proprietary driver, `23.10.24.07 (AMD proprietary shader compiler)`.
- 16.384 workgroups de 64 invocacoes; 1.048.576 atribuicoes.
- Dois processos: **1.172ms** e **445ms**, status 0, sem erro/sinal. Primeiro host reportou 428ms. Tempos de processo/host, nao benchmark GPU isolado.
- Duas saidas de **4.194.304 bytes**, identicas byte a byte, SHA-256 `d92ccfe9ce8e5614ffa10a93bd8b52502489aa005a987713622bc61d4864cfec`.
- Todos os slots validados antes da ponte, sem reparo CPU, sentinela, indice fora do dominio, fallback ou timeout real.
- Prova derivada dos bytes recebidos: **29.073 bytes**, SHA-256 `235013e58aa06eece569b5c1395995ae78f1dfb3a52443a6a9f6f0cc2d757adf`. Igualdade com a fixture deterministica nao substitui a evidencia de execucao fisica; origem e caminhos continuam separados.

## Conferencia publica proposta nesta selecao

O novo conferidor `scripts/fase4-b-5p4c-carcara-gpu.mjs` importa apenas o verificador de pacote real, o tradutor e o validador. **Nao importa fixture sintetica, nao executa outro solver.** Reconstroi o buffer e a prova a partir dos bytes do pacote, vincula host/kernel/lock/fontes/pins e executa o Carcara Linux real sob pin aprovado, 20s e 1MiB.

Exige positivo `valid` e tres provas mutantes `invalid` com diagnostico correspondente, mais quatro testemunhos mutantes recusados apos recalcular seus hashes. Nenhum timeout conta como negativo aprovado. O caminho sintetico anterior permanece em etapa e diretorio separados.

Testes locais selecionados: **29/29 Node** (9 do envelope real + 12 de 5p/4c + 8 regressao 4p/3c). Typechecks e 13/13 pins preservados. A suite Vitest completa nao foi reexecutada nesta etapa.

Este documento registra a observacao local e a preparacao da publicacao; nao antecipa resultado do proximo run. Certificado e recibo final somente apos o Linux aprovar o pacote real. Identificacao GPU e observacao operacional, nao atestacao criptografica de hardware. Instancia fixa booleana, sem SMT geral, OTS ou ancora independente.
