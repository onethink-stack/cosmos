# Fase 4 — critério registrado, implementação não iniciada

Este commit sela o P1 Groq existente. A Fase 4 fica apenas documentada; não há implementação nova de GPU, Carcara ou Alethe nesta entrega.

Ordem acordada com o proprietário:

1. **B primeiro:** placa de vidro GPU com certificado conferido independente.
2. **A segundo:** Carcara.
3. **C terceiro:** Alethe.

A ordem acima registra prioridade, sem declarar executado ou aprovado nenhum desses componentes. O desenho técnico e a execução da Fase 4 dependem de etapa posterior.

Condições de preservação:

- **13/13 SHA-256** do fechamento P1 preservados, segundo `evidencias/p1-groq-sha256-esperados.json`.
- `src/interfaces/config.ts` preservado **byte a byte**, com endpoints reais nulos.
- Nenhum segredo em `VITE_*`, navegador, artefato, log ou Git. A chave Groq real não é lida nem usada pela CI de selagem.
- P0 simulado e P1 Groq continuam separados. Todos os testes Groq usam mocks; nenhuma inferência real faz parte da selagem.
- Sem merge na branch Fase 3, sem push em main/master e sem deploy.

## Evidência da selagem P1

O verificador `scripts/verificar-p1-selada.mjs` exige resultado real **995/995**, **65 arquivos**, zero falhas e zero pulados, além das 13 comparações SHA-256 após os builds. Uma divergência encerra com código diferente de zero; não basta editar uma contagem no texto.

O workflow `.github/workflows/p1-groq-selada.yml` executa a seleção commitada em Windows e Linux, com instalação do lockfile, testes seriais, typecheck, dois builds e relatório do verificador, sem credencial Groq ou deploy.

Marcos históricos de referência, sem reatribuição:

- Fase 3: `502426c0e6f7b96851f0c5e2bff65e3199db24f4`.
- Verificador público congelado: `17a016817c539658d4a92c01d8cb5284333ff115`, caminhos `especificacao/provas-t1` e `especificacao/registros-v1`.
- CI histórica: [39664843135](https://github.com/onethink-stack/cosmos/actions/runs/39664843135).

O run ID da selagem P1 será outro e deverá apontar ao commit P1 publicado. OTS confirmado e âncora independente permanecem pendentes; esta selagem não os substitui.
