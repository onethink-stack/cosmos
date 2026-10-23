# Cosmos v2 — entrega para análise antes do commit

**Atualização posterior:** este documento preserva a revisão que encontrou R1/R2. Ambos foram corrigidos após autorização, com quatro regressões e suíte completa **769/769**, 53 arquivos, 199,26 s. Veja `RELATORIO_PATCHES_V2.md` e `evidencias/v2-arrays-merkle-suite.log`. As pendências operacionais e os limites desta revisão permanecem; nenhum commit/tag/push/deploy foi realizado.

Data: 2026-10-22. Escopo: revisão local do código, contratos, evidências e casos de borda. Não é uma auditoria independente nem homologação para serviço público.

**Conclusão:** a base local está demonstrada pelas evidências abaixo, mas a revisão encontrou dois desvios reproduzíveis não cobertos pela suíte atual. A aprovação final da v2 não está encerrada. Nenhum código de implementação foi modificado nesta revisão; foram adicionados somente este relatório, um diagnóstico reproduzível e sua saída.

## Fato → fonte → limite

| Fato observado | Fonte verificável | Limite da afirmação |
|---|---|---|
| A última execução completa passou em 53 arquivos, 765 testes, zero falhas, 195,96 s | `evidencias/z3-timeout-nucleo-suite.log`; `RELATORIO_Z3.md` | É a execução anterior registrada, não uma nova execução feita nesta revisão. Casos de borda abaixo não estão cobertos por essa contagem. Nenhum teste foi adicionado nesta revisão. |
| Parser rejeita chaves duplicadas após decodificar escapes, evita alteração de protótipo e rejeita inteiros inseguros | `src/motor/registro.ts`; `testes/regressao-parser.test.ts` | Não aplica NFC retroativamente à v1. O perfil rejeita ponto/expoente; não é parser JSON de uso geral irrestrito. Limites de bytes/profundidade ficam na entrada v2. |
| Envelope v1 recebido passa na verificação interna e externa; resumo é `4bd9026d…` | `src/motor/elosCosmos.ts`; `testes/regressao-envelope.test.ts`; `evidencias/revisao-v2-diagnostico.json`, campo `envelopeV1` | Verificação da assinatura sob a chave fixada não comprova verdade, pessoa única ou autorização externa. A conferência interna isolada permanece distinguível da conferência do envelope completo. |
| Perfil v2 define ordenação UTF-16, inteiros seguros e rejeição de strings fora de NFC | `src/v2/canonico.ts`; `testes/regressao-jcs-v2.test.ts`; `especificacao/cosmos-v2.md` | É um subconjunto restrito de JSON/JCS. NFC é regra adicional do projeto, não exigência nem transformação da RFC 8785. Há desvio em arrays recebidos como objetos JavaScript, descrito em R1. |
| Resultados de integridade, assinatura, prova formal, timestamp e conclusão são separados | `src/motor/cadeiaCosmos.ts`; `src/ui/VerificacaoCosmos.tsx`; `testes/regressao-selos.test.ts` | Para a ficha v1, prova formal retorna `nao_aplicavel` e conteúdo pode permanecer `inconclusivo`. Não há kernel novo, revisão humana automática, I-AI/RAG treinada ou detector universal de mentira. |
| Existe arquivo `.ots` de 532 bytes e um alvo de resumo + LF; o status salvo é `enviado_calendario`, não confirmado | `public/cosmos-502426c-resumo.txt.ots`; `public/cosmos-ots-status.json`; `scripts/cosmos-ots.py`; `testes/regressao-ots.test.ts` | O status JSON não é prova autenticada. Parsing e vínculo SHA-256 não confirmam submissão histórica nem Bitcoin por si só. O código de confirmação depende de Bitcoin Core local e seis confirmações; esse caminho confirmado não foi demonstrado nesta revisão. Não houve upgrade/envio externo agora. |
| A raiz calculada das nove folhas coincide com `842ecb720637b4477272c892bd4d542376a52cf1e73e9e14b62c95cfc73e841c`; nove provas de inclusão e oito de continuidade do arquivo verificam | `public/cosmos-checkpoint-v1.json`; `src/v2/transparencia.ts`; `evidencias/revisao-v2-diagnostico.json`, campo `checkpoint` | Provas locais não autenticam uma âncora externa. O proprietário escolheu somente arquivo local. Primeiro contato, origem comprometida, verificador alterado e falta de gossip continuam fora da proteção. Há desvio no caso vazio → vazio, descrito em R2. |
| A admissão v2 verifica Ed25519 sobre registro canônico com separação de domínio, sequência, hash anterior e idempotência; SQLite usa WAL/FULL/BEGIN IMMEDIATE e unicidade | `src/v2/ledger-node.ts`; `testes/regressao-admissao-v2.test.ts` | Autenticação é posse de chave, sem prova de humanidade. Triggers não impedem o administrador de alterar o próprio arquivo SQLite. O teste de duas conexões usa o mesmo processo/event loop; não comprova concorrência em múltiplos processos sob carga ou falha de energia. |
| API admite pedidos assinados e aplica limites de corpo, profundidade, conexões e requisições; entrypoint escuta em loopback | `src/v2/api-node.ts`; `src/v2/servidor.ts`; `testes/regressao-api-v2.test.ts` | É base experimental local. Não há TLS público, quotas cumulativas de armazenamento ou paginação de exportação. Limites de requisição não são proteção suficiente contra DDoS distribuído. |
| Objetos são endereçados por SHA-256, gravados em duas réplicas configuráveis e conferidos na leitura | `src/v2/objetos-node.ts`; teste de corrupção em `testes/regressao-admissao-v2.test.ts` | Dois diretórios não garantem independência física. Não há teste de recuperação após queda de energia envolvendo SQLite e diretórios de objetos. O código sincroniza o arquivo temporário, mas não explicita sincronização do diretório após criar o link. Não se deve prometer atomicidade durável conjunta entre banco e objetos. |
| `qsqrt2.ts` documenta coeficientes inteiros seguros, BigInt intermediário e rejeição de estouro | `src/motor/qsqrt2.ts`; `testes/qsqrt2.test.ts` | Representa uma faixa limitada de ℤ[√2], não todo ℚ(√2); não é função hash. |
| Orçamento de emissão transferível é zero e regras de disputa são propostas documentadas | `especificacao/cosmos-v2.md`, seção 7 | Nenhuma moeda, saldo, staking, reputação automática ou mercado ativo foi implementado. |

## Achados reproduzidos na revisão

### R1 — Média: perfil de arrays JavaScript não é cumprido integralmente

**Fato:** `canonicalizarV2` confere somente `Object.keys(v).length === v.length` antes de chamar `v.map`. Um array com getter em `0` é aceito, o getter é executado e o resultado é `[1]`. Um array de comprimento 1 com uma lacuna e uma propriedade `extra` também passa na contagem e vira `[]`, descartando a estrutura original.

**Fonte:** `src/v2/canonico.ts:40–42`; script `scripts/auditar-entrega-v2.mjs`; campos `achados.arrayAccessor` e `achados.arrayEsparsoComExtra` em `evidencias/revisao-v2-diagnostico.json`.

**Limite:** reproduzido na API JavaScript exportada. Não foi demonstrado caminho remoto de exploração: `lerCanonicoV2` recebe texto JSON e o parser produz arrays de dados densos, sem getters. O achado viola o contrato documentado para chamadas diretas; não demonstra falsificação Ed25519 ou alteração dos hashes v1.

**Critério de correção:** validar os próprios índices e seus descritores, rejeitar lacunas, accessors e propriedades incompatíveis antes de acessar elementos; adicionar regressões para esses exemplos sem invocar o getter. Manter a ordem dos elementos.

### R2 — Baixa: raiz incorreta aceita em consistência vazio → vazio

**Fato:** `verificarConsistencia(0, 0, zeros64, zeros64, [])` retorna `true` porque o atalho `m === n` antecede a validação da raiz vazia. A raiz SHA-256 correta do vazio é `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, não zero.

**Fonte:** `src/v2/transparencia.ts:52–53`; campo `achados.consistenciaVazia` no diagnóstico. A definição da árvore vazia é dada na RFC 9162, §2.1.1.

**Limite:** o checkpoint atual tem nove folhas e suas provas verificaram. Não foi demonstrado ataque ao checkpoint atual. O achado diz respeito à extensão da API local que admite tamanho zero, não à implementação de todo o protocolo Certificate Transparency.

**Critério de correção:** tratar a árvore vazia antes da igualdade genérica, verificar ambas as raízes quando ambos os tamanhos forem zero e adicionar teste desse limite. Rever o tratamento de checkpoints vazios em `avaliarCheckpoint` para que use a mesma definição.

## Limites operacionais que não são testes de falha observada

1. **Exportação sem paginação:** `LedgerV2.exportar` usa `.all(autor)` e a resposta HTTP serializa a cadeia inteira. O limite de 256 KiB é de admissão, não de resposta acumulada. Risco de consumo de memória/event loop com cadeias grandes; não foi executado ataque de exaustão. Definir limite/paginação e quotas antes de exposição pública.
2. **Persistência entre banco e objetos:** sincronizar o temporário e usar link atômico não demonstra recuperação coordenada de todos os arquivos após queda de energia. Não foi simulado power loss nem comprovada perda. Exigir ensaios de recuperação e política de reconciliação antes de prometer durabilidade conjunta.
3. **Exportação/reconstrução:** cada elo continua assinado, mas o cabeçalho agregado da exportação não é assinado por uma nova autoridade. Importadores precisam conferir elos e continuidade; reconstrução interrompida pode manter um prefixo validado. Evidências externas precisam estar disponíveis nas réplicas de destino, pois o JSON contém hashes, não seus bytes.
4. **Dependências:** `evidencias/v2-audit-final.json` registra três vulnerabilidades altas e zero críticas naquela execução. Esse arquivo é um snapshot histórico, não uma consulta atual de vulnerabilidades nem atestado de segurança da cadeia de suprimentos.
5. **OTS e UI:** a CLI/status têm estados operacionais detalhados; a UI da ficha v1 continua exibindo timestamp pendente a partir do pacote histórico. Não há promoção automática da UI para confirmado a partir do status JSON, nem integração de confirmação demonstrada nesta revisão.

## Preservação conferida nesta revisão

| Arquivo | SHA-256 atual |
|---|---|
| `src/dados/cadeia-F0-F4.json` | `aba1b7a19c4a1447bc9da61f404478ce2be79c49a896ecf80567f54dd3cb6587` |
| `src/dados/cadeia-outras-F5-F8.json` | `866c2bc76e65fb94186c76b72e6dbcb713ef72fff4e7a21f5b36a8b6e8edff22` |
| `src/dados/elos-assinados.json` | `4c19b93be7cadff2ce79a81679580e57d0865197bd607bac92700aa851676aca` |
| `src/dados/selo-publico.json` | `ab32fe665f2a980d49fda6784df97bb6b01e7d20e35b499601a5d46d46cc032a` |
| `dist/cosmos-502426c.json` | `9e4d4fd13f16ff48d79ebbbb6c354bf5802374b2a2d247dc31d8d9890492f267` |

O resumo da cadeia permanece `4bd9026dd6ed7ea5b637788081bf553475977b22e772fc4c4dc0e550e59656ff`, distinto do hash dos bytes da exportação. A chave pública fixada permanece `6e97907683718d984dd96bd156ecd3c504bf35c513e1cf1d842f4bc9241b7382`. `git diff` dos dados, quatro ícones e lockfile está vazio. Nenhuma chave privada foi acessada.

## Reprodução e estado Git

```powershell
node scripts/auditar-entrega-v2.mjs
```

O diagnóstico carrega módulos existentes pelo Vite, confere o pacote/provas, reproduz R1/R2 e grava somente `evidencias/revisao-v2-diagnostico.json`. Não instala dependências, não inicia o servidor HTTP de admissão, não envia prova OTS nem publica checkpoint.

HEAD observado: `4160ff1ae1a0eadca1e16eaefe9d6d62684ddd50`. Índice Git sem arquivos staged. Sem commit, tag, push ou deploy. Os outros arquivos modificados/não rastreados da pasta continuam preservados e não devem ser incluídos por `git add -A` indiscriminado. O inventário de um futuro commit deve separar v2, desbloqueio da base, Z3/SQLite e trabalho local preexistente.

## Referências primárias

- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html): serialização e ordenação JCS; não define normalização NFC.
- [RFC 9162, §2.1](https://www.rfc-editor.org/rfc/rfc9162.html#section-2.1): definição das árvores e provas Merkle.
- [SQLite — Atomic Commit](https://www.sqlite.org/atomiccommit.html): garantias transacionais dependem de sincronização/armazenamento; não estendem automaticamente uma transação aos objetos externos do aplicativo.

**Próximo critério de encerramento:** corrigir R1/R2 com testes de regressão, repetir validação apropriada, conferir preservação e só depois revisar o conjunto exato de arquivos para eventual commit/tag da v2 completa. Publicação externa e confirmação Bitcoin continuam pendências separadas.
