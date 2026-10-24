# Cosmos — pesquisa de funções e integrações

Data: 23/10/2026. Pesquisa de documentação oficial e leitura do checkout. Recomendações de produto, não implementação, contratação ou autorização de rede/deploy. Não foram lidas credenciais, cofres ou diretórios privados.

## Diagnóstico confirmado no código

- `src/interfaces/config.ts`: `comprovadosPath`, `ragEndpoint` e `cosmMarketEndpoint` nulos.
- `src/interfaces/dados.ts`: consulta determinística ao catálogo; candles e book demonstrativos.
- `src/interfaces/Produtos.tsx`: ordens demonstrativas em estado de componente; Portfolio usa carteira local separada.
- `src/interfaces/Labs.tsx`: rascunhos cifrados por conta, exemplos, filtro e triagem literal; não executa prova formal na UI.
- `src/local/`: conta/cofre, dados cifrados, backup e ledger assinado local existem. Não são login de servidor nem sincronização/consenso.
- `src/v2/`: base de admissão/armazenamento existente deve ser avaliada para reutilização; não pressupor backend de produção pronto.
- Documentos `ENTREGA_CONTA_LOCAL.md` e `AUDITORIA_FUNCIONAL_COSMOS.md`: situação posterior da integração local. O corpo inicial da auditoria é histórico e não deve ser confundido com o estado atualizado.

## Catálogo de funções recomendadas

Legenda: P0 = fundação para integrações; P1 = próxima entrega útil; P2 = evolução; P3 = posterior, com decisões de produto/segurança. Prioridades são recomendação desta pesquisa.

| Área | Função | Situação / complemento necessário | Prioridade |
|---|---|---|---|
| Geral | Configurações de integrações | Selecionar provedor, endpoint permitido e modelo; conectores ainda ausentes | P0 |
| Geral | Gerenciar credenciais | Referências a segredos no backend, mascaramento, revogação e teste; nunca chaves privadas de carteira | P0 |
| Geral | Estado dos serviços | Local, conectado, indisponível, sem configuração, dados desatualizados; erros acionáveis | P0 |
| Geral | Orçamento e quotas | Limite por usuário/provedor, tamanho, tokens, concorrência, tempo e cancelamento | P0 |
| Geral | Busca e atalhos globais | Fórmula, ID, hash, domínio, autor; permissões antes de exibir resultados | P1 |
| Geral | Acessibilidade e preferências | Contraste, teclado, foco, zoom, idioma, tema e redução de movimento | P1 |
| Geral | Central de notificações | Verificação concluída, oferta expirada, revisão solicitada; local primeiro | P2 |
| Conta | Identidade e escopos de chave | Mostrar distinção autoria local / conta de servidor / chave histórica | P0 |
| Conta | Passkeys/login de servidor | Novo backend de desafio e sessão, revogação de aparelhos; não prova pessoa única | P2 |
| Conta | Recuperação assistida | Testar restauração, lembrar backup; não prometer recuperar seed pela senha do servidor | P1 |
| Conta | Sincronização cifrada | Definir pareamento de aparelhos, chaves, conflitos e restauração antes de conectar | P2 |
| Conta | Permissões de workspace | Privado, equipe e público; papéis de leitura, edição, revisão/publicação | P2 |
| Conversa | IA conversacional de fato | Adaptador de modelo local ou remoto, hoje ausente | P1 |
| Conversa | Streaming e cancelar | Resposta incremental, interromper, retentar e erros sem duplicar cobranças/pedidos | P1 |
| Conversa | Arquivos e OCR | Upload real de PDF/TXT/MD e imagens, extração, limites e permissões; clipe atual é decorativo | P1 |
| Conversa | RAG com origem precisa | Indexação, busca lexical + vetorial, reordenação e citação de trecho/página/hash | P1 |
| Conversa | Não encontrado/inconclusivo | Recusar conclusão quando fontes não sustentam; medir recuperação e abstenção | P0 |
| Conversa | Projetos e histórico | Histórico já existe; faltam nomear, pesquisar, organizar, exportar e excluir com confirmação | P1 |
| Conversa | Modos de trabalho | Explicar, comparar, resumir, propor rascunho; salvar no Labs exige ação explícita | P1 |
| Conversa | Pesquisa científica | Consulta por DOI, metadados, versão e aviso de retratação; metadado não é texto completo/prova | P2 |
| Conversa | Voz | Ditado e leitura opcional; definir processamento local/remoto e permissão de microfone | P3 |
| Conversa | Ferramentas/agentes | Lista permitida e autorizações por ação; nunca acesso do modelo à seed ou assinatura irrestrita | P3 |
| Labs | Editor de fórmulas | Renderização matemática, símbolos, sintaxe, domínio e hipóteses explícitas | P1 |
| Labs | Estados e revisão | Rascunho, em análise, formalmente conferido quando cabível, refutado, inconclusivo; histórico | P1 |
| Labs | Evidências anexadas | Arquivo, hash, tamanho, licença, origem, autor e relação exata com uma versão do registro | P1 |
| Labs | Verificador Alethe/Carcara | Adaptador existe fora da UI; integrar fila, processo isolado, limites e resultado verificável | P1 |
| Labs | Contraexemplo | Exibir modelo/contraexemplo conferido; triagem A/¬A não basta | P1 |
| Labs | Grafo de dependências | Premissas, derivações, versões e impacto de invalidar um elo | P2 |
| Labs | Diff e versionamento | Comparar enunciado, hipóteses, evidências e certificado, sem reescrever v1 | P1 |
| Labs | Revisão por pares | Comentários vinculados à versão, divergência, parecer e contestação | P2 |
| Labs | Deduplicação | Exata e sugestão semântica; não tratar fórmulas parecidas como equivalentes sem prova | P2 |
| Labs | Import/export | Pacote assinado, JSON, Markdown, LaTeX e bibliografia; validar antes de admitir | P1 |
| Labs | Proveniência pública | Exibir integridade, autoria, prova formal e timestamp separadamente | P1 |
| Terminal | Lista de acompanhamento | Favoritos e filtros de ofertas/ativos; pode começar local | P1 |
| Terminal | Gráfico profissional | Zoom, crosshair, volume, períodos e indicadores com cálculo definido; não exige preço público para funcionar em simulação | P2 |
| Terminal | Ordens persistentes | Hoje só na sessão; registrar criar/cancelar/executar e eventos idempotentes | P1 |
| Terminal | Matching local | Prioridade preço/tempo, execução parcial, cancelamento e reserva de saldo; apenas teste nesta etapa | P2 |
| Terminal | Mercado de axiomas | Problema, domínio, evidência exigida, recompensa, prazo e critérios de aceite | P1 |
| Terminal | Escrow ligado ao ledger | Cenário V3 existe; integrar trava, liberação única, queima, expiração, reembolso e disputa | P2 |
| Terminal | Portfólio e extrato | Saldo local já existe; acrescentar reservas, ordens, taxas e relatório por rede | P1 |
| Terminal | Alertas e replay | Condições de oferta/preço, reconexão, eventos fora de ordem, lacunas e deduplicação | P2 |
| Terminal | Mercado externo | Conector autorizado e fonte por ativo; cotação não é execução de ordens | P3 |
| Infra | Backend operacional | Autorização por recurso, validação, limites, idempotência, erros e migrações | P0 |
| Infra | Índice e objetos | Reutilizar SQLite local; avaliar Postgres para servidor. Busca vetorial é índice reconstruível, não ledger | P1 |
| Infra | Arquivos privados | Armazenamento, quotas, checagem de tipo, quarentena e links temporários quando remotos | P1 |
| Infra | Fila de execução | Ingestão/OCR/provas/indexação com progresso, cancelamento e repetição segura | P1 |
| Infra | Operação e observabilidade | Logs sem segredos, métricas, trilhas de auditoria, backup e ensaio de restauração | P0 |
| Infra | API de desenvolvedor | Tokens próprios com escopo/expiração, OpenAPI, SDK/CLI e webhooks assinados | P2 |
| Infra | Segurança do RAG/agentes | ACL antes da recuperação, fontes não confiáveis, saída sanitizada, ferramentas restritas | P0 |
| Infra | Testes de produto | Fluxos de ponta a ponta, permissões, corrupção, rede interrompida, mobile, teclado e desempenho | P0 |

Não se recomenda implementar tudo simultaneamente. Este é um mapa de possibilidades, não um compromisso de escopo.

## Chaves, credenciais e infraestrutura

Os nomes abaixo são propostas ilustrativas para configuração futura; não existem como integrações prontas no checkout.

| Integração | Precisa chave? | Uso / observação |
|---|---|---|
| Modelo local Ollama | Não para API local padrão | Requer runtime, modelo e hardware; manter loopback e política de acesso. Não instalado/configurado por esta pesquisa |
| Claude API direta | Sim, credencial do provedor | Conversa, documentos e citações; chave somente no backend |
| Cloudflare Workers AI / AI Gateway | Depende da via | REST exige autenticação Cloudflare; binding de Worker usa recursos vinculados. Não exige sempre chave individual de cada provedor |
| Embeddings/reordenação | Depende da execução | Local ou serviço remoto; não é obrigatório contratar outro provedor |
| SQLite + busca lexical local | Não exige chave externa | Reutilizar base local; índice não substitui assinaturas |
| Postgres gerenciado / Qdrant remoto | Credenciais de serviço | Escolher conforme demanda; não contratar dois bancos por padrão |
| Crossref público | Não | Busca de DOI/metadados; respeitar limites. Contato no modo polite só com dado autorizado |
| GitHub privado | GitHub App/OAuth/token com escopo | Somente se integrar repositórios privados ou escrita; não pedir token pessoal amplo para todo uso |
| CoinGecko | Chave do plano/endpoint escolhido | Dados de ativos cobertos; não cria cotação ou book real do COSMOS local |
| Gráfico Lightweight Charts | Não é um serviço de cotação | Biblioteca local com exigências de licença/atribuição; dados vêm de outra fonte |
| Passkeys próprias | Não depende de chave comercial | Precisa backend WebAuthn, domínio e sessão; login não recupera sozinho o cofre |
| Login OAuth/e-mail | Credenciais do provedor escolhido | Só ao optar por login de servidor; e-mail transacional é opcional, não necessário para cofre local |
| Storage remoto | Credenciais de serviço | Upload autorizado, ACL/URLs temporárias; nada secreto no frontend |
| Carcara | Não exige chave de API | Binário/serviço de verificação com isolamento e prova Alethe compatível |
| OpenTimestamps | Protocolo não exige uma chave comercial por padrão | Verificação Bitcoin e atualização da prova são outra integração; esta pesquisa não consultou estado atual da rede |
| Ledger COSMOS local | Não exige API pública | A chave criptográfica local assina operações; não é chave de serviço nem se envia ao provedor de IA |

## Regras da área Configurações → Integrações

1. Provedor + endpoint permitido + modelo + limites. Não aceitar URL arbitrária do cliente no proxy, para evitar SSRF.
2. Credencial guardada em segredo do servidor, identificada por referência; botão testar usa pedido mínimo e mostra diagnóstico sanitizado.
3. Conectado, inválido, indisponível, sem quota ou não configurado; nunca apresentar configuração salva como conexão comprovada.
4. Quotas por pessoa/workspace e orçamento por operação; medição de tokens/latência/erros e política de retries.
5. Opt-in de envio remoto por workspace/documento; retenção e logs definidos. Documentos privados não entram automaticamente em RAG público.
6. Revogação/rotação, trilha de alteração e separação desenvolvimento/produção.
7. API key de provedor, token de sessão e chave privada/seed da carteira são categorias distintas.
8. `VITE_*` aparece no bundle. Nem variáveis de frontend nem localStorage comum são cofres de segredos do serviço. Usar backend/local backend autorizado.

## Armadilhas específicas

- Citações ajudam a localizar origem; não provam que uma resposta é correta ou que um axioma é verdadeiro.
- Similaridade vetorial não é confiança/probabilidade de verdade. Não aplicar 0,85 universal sem avaliação do corpus e recuperação.
- Um DOI não garante validade, ausência de retratação ou licença para redistribuir o artigo completo.
- Login/passkey não demonstra identidade civil ou uma pessoa única. Anti-Sybil/consenso seguem como decisões arquiteturais separadas.
- SHA-256, assinatura, prova formal e ancoragem temporal têm escopos diferentes; manter os quatro resultados.
- A API de preço não cria mercado nem liquidez. Book, execução e liquidação precisam de fonte e protocolo próprios.
- Identificar ativos por ID e, quando aplicável, rede/contrato; não assumir que COSM ou Cosmos remete ao ativo deste projeto ou a ATOM.
- Não conectar chave de corretora com permissão de saque, custódia, staking real ou fundos nesta etapa. Isso não é necessário para construir um marketplace de conhecimento local.
- OTS confirmado/âncora externa: permanecem pendências no último estado documentado; não foi feita nova consulta de rede para confirmá-las.

## Ordem sugerida

1. Configurações + backend de integração + orçamento e permissões. Reutilizar a conta local e avaliar a API v2 existente.
2. Um modelo + documentos + RAG com citações. Começar com corpus autorizado, conjunto de avaliação e abstenção.
3. Labs com evidências versionadas e verificador formal isolado, incluindo inconclusivo e contraexemplos.
4. Ofertas de axiomas persistentes e escrow/ledger unificados em ambiente local de teste; testar concorrência, reservas e disputa.
5. Somente depois: colaboração entre aparelhos, login de servidor e sincronização. Mercado público e moeda real exigem decisão separada.

Minha recomendação de produto é priorizar o ciclo **perguntar → fonte → rascunho → evidência → verificação → oferta de conhecimento**, em vez de começar por gráficos de uma moeda sem mercado conectado.

## Fontes oficiais consultadas

- [Claude: citações e streaming](https://platform.claude.com/docs/en/build-with-claude/citations) — referências a documentos e eventos de citação.
- [Ollama: autenticação](https://docs.ollama.com/api/authentication) — distinção local/nuvem.
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) — métricas, cache, limites e fallback.
- [Cloudflare AI Gateway REST](https://developers.cloudflare.com/ai-gateway/usage/rest-api/) — autenticação e modalidades de acesso.
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — gestão de segredos.
- [Vite: variáveis de ambiente](https://vite.dev/guide/env-and-mode) — exposição de `VITE_*`.
- [Qdrant: busca híbrida](https://qdrant.tech/documentation/search/hybrid-queries/) — recuperação lexical/vetorial e pipelines.
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — permissões no banco.
- [SimpleWebAuthn](https://simplewebauthn.dev/docs/) — componentes browser/servidor.
- [Carcara](https://github.com/ufmg-smite/carcara) — conferência/elaboração de provas SMT Alethe.
- [Crossref: acesso e autenticação](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/) — API pública e limites.
- [Crossref: REST](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) — metadados e limites de licença.
- [CoinGecko: autenticação Pro](https://docs.coingecko.com/reference/authentication) — credencial, backend/proxy e quotas.
- [CoinGecko: IDs dos ativos](https://docs.coingecko.com/reference/coins-list) — ID/símbolo/plataforma/contrato.
- [TradingView: Datafeed](https://www.tradingview.com/charting-library-docs/latest/connecting_data/datafeed-api/) — biblioteca não inclui dados de mercado.
- [Lightweight Charts](https://tradingview.github.io/lightweight-charts/docs) — biblioteca, licença/atribuição e atualização de séries.
- [OWASP: prompt injection](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) — documentos maliciosos, RAG poisoning, menor privilégio e revisão humana.

Nenhuma dependência instalada, credencial criada, endpoint acionado com dados do projeto, código de implementação alterado, commit, push ou deploy realizado. Este arquivo é somente planejamento e pesquisa.
