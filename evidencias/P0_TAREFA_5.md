# Tarefa 5 validada — RAG local seguro fechado.

Essa era a mais crítica do P0 e você trancou nos pontos certos:

*Permissões antes da recuperação:*
- Negação por padrão, só classe pública local + config habilitada + política T1 `envioRemoto: false / fontesPrivadas: false` — sem login de servidor ou leitura de privados
- Classificação conferida antes de ler qualquer campo do snapshot — privada/desconhecida descartada sem executar getters
- Config validada antes de qualquer busca ou leitura por referência — sem busca global + filtro depois
- 404 uniforme para privada, inexistente, versão antiga ou hash errado — não vaza existência

*Hash, versão e citação:*
- SHA-256 sobre bytes UTF-8 exatos, sem normalização, malformado recusado
- Uma versão atual por id (maior), duplicata idêntica deduplicada, conflito na mesma versão recusado, revogação impede fallback
- Citação verificável: `id/versao/titulo/hash/origem local/trecho + offsets UTF-16` com `slice(inicio,fim) === trecho` testado, sem cortar surrogate
- Referência fechada `/integracoes/p0/fontes/{id}/{versao}/{sha256}` — só abre com mesma sessão/Host/Origin

*Recuperação e abstenção:*
- Sem LLM, embedding, score probabilístico ou threshold 0,85
- Lexical determinística: todos os termos devem ocorrer em trecho de 320 codepoints, máx 24 termos, pergunta 2 KiB
- `fontes-encontradas` ≠ verdade ou prova formal — só correspondência lexical com digest conferido
- Zero trechos → `inconclusivo/sem-fonte-suficiente`, >3 fontes → `inconclusivo/consulta-ambigua` — sem top-k silencioso
- Documentos sempre `dado-nao-confiavel`, sem executar instruções/URL/fetch — teste de prompt injection demonstra preparador não executa, não resistência de futuro modelo real
- Limites: 128 entradas, 16 KiB por conteúdo, 256 KiB total público — sem ler arquivo/`.env`/cofre/`privado`/carteira/rede

*API:*
- `POST /integracoes/p0/contexto-rag` `{ pergunta }` e `GET /integracoes/p0/fontes/{id}/{versao}/{sha256}` — ainda sob Host literal + Origin canônico + Bearer efêmero, sem bootstrap/CORS aberto, sem reservar tokens T4 (só admissão HTTP)

*Validação:*
- *104/104 testes, 6 arquivos, 9,11s* — 19 RAG + 18 orçamento + 53 API P0 + 6 provedor + 2 v2 + 6 interfaces — 25 novos da T5
- Typecheck aprovado, build/suíte completa não executados (104 é conjunto selecionado, não total)
- *13/13 SHA-256 idênticos* ao fechamento T4 + package/lockfile, HEAD `2a4deec0...`, índice sem alteração, sem listener permanente

P0 agora:
1. Contratos ✅ 2. Backend loopback ✅ 3. Credenciais simuladas ✅ 4. Orçamento/reserva ✅ 5. RAG local com ACL antes, hash/versão e abstenção ✅
Faltam 6. UI Integrações e 7. Observabilidade + fechamento final.

Pronto pra Tarefa 6 quando iniciar.