# Autorização ampla do operador — B GPU

O usuário aprovou expressamente nesta conversa todas as etapas de `FASE4_B_GPU_PROTOCOLO.md`: ponte sintética → Alethe, árvore de resolução com compressão por prefixo, tradutor fixo de 288 bytes, Rust/wgpu/Cargo.lock, kernel WGSL 64×64, host e backend pinados, dispositivo físico Vega 8 sem fallback CPU, publicação do workflow separado em Ubuntu 22.04/Node 22.14.0, execução de 4096 testemunhos/16384 bytes e certificado `cosmos-b-gpu-cert-v1` conferido no Linux.

Fonte: declaração “OPERADOR COSMOS — APROVAÇÃO AMPLA B GPU”, seguida de “De resto, execução auto-aprovada até recibo final”. É autorização expressa no chat; nenhuma assinatura criptográfica é atribuída ou criada em nome do operador.

Base congelada: `c64457f91e9e00ff82b68afc5f3a768a9171c98b`; CI CPU `40118753348`. Implementação em branch nova `codex/fase4-b-gpu`. P1, dados v1, seus 13 pins e `config.ts` preservados. Sem merge/main/master/deploy.

Esta autorização posterior permite ferramentas e publicação de B no escopo acima, superando a restrição anterior de não instalar Rust/não publicar B. Preferir compilação em runner descartável e ferramentas isoladas ao projeto, sem alterar instalações globais do usuário.

Interromper e contatar o operador diante de resultado real fora dos critérios: negativo não recusado, slot não escrito, índice fora do domínio, sentinela SAT, Carcara diferente dos vereditos esperados, divergência entre repetições GPU, adaptador CPU/software, prazo excedido ou prova acima de 1 MiB. Negativos sintéticos intencionais são testes de recusa, não incidentes de produção. Nenhum teste sintético conta como execução GPU.
