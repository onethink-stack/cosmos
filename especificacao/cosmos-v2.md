# Cosmos Provenance Ledger v2 — perfil local inicial

Estado: implementação local experimental. Nenhum commit/push/deploy ou publicação externa nesta entrega. F0–F8 v1 são preservadas byte a byte. A v2 não redefine suas fases.

## 1. Canonicalização

`cosmos-provenance-v2`: perfil restrito de JSON compatível com JCS RFC 8785. Primitivos ECMAScript e ordenação por unidades UTF-16. Somente números inteiros seguros; números fracionários, BigInt, NaN, Infinity, objetos com accessors/protótipos especiais e arrays esparsos são rejeitados.

Chaves duplicadas são rejeitadas após decodificar escapes. Strings/chaves com substitutos Unicode isolados ou fora de NFC são rejeitadas. **NFC é restrição adicional do perfil, não operação de JCS.** Não há normalização automática. Documentos de admissão devem já estar canônicos, sem espaços ou LF extras.

Limites: UTF-8 262.144 bytes, profundidade 32, checagem lexical antes de leitura recursiva. A v1 não usa essa canonicalização nova.

## 2. Registro e assinatura de admissão

Envelope tem exatamente `registro` e `assinatura`. Registro:

```json
{"anterior":"64 hex","autor":"chave pública Ed25519, 64 hex","conteudo":{},"evidencias":[],"formato":"cosmos-provenance-v2","indice":0,"pedido":"identificador-idempotente"}
```

Mensagem assinada: UTF-8 de `cosmos-provenance-v2\n` concatenado ao JSON canônico do registro. Hash do elo: SHA-256 desses mesmos bytes. Assinatura: 128 caracteres hexadecimais minúsculos. Verificação estrita usa `conferirAssinatura` existente, incluindo rejeição de chave de pequena ordem.

`autor` é uma chave, não uma pessoa comprovadamente única. Não há pin da chave v1 nesse protocolo novo. O primeiro elo tem índice zero e anterior de 64 zeros. Cada elo seguinte tem índice consecutivo e hash anterior exato. Até 32 hashes de evidência. `pedido` usa `[a-zA-Z0-9._:-]`, 1–128 caracteres, faz parte da assinatura.

## 3. Admissão/concorrência

`POST /v2/elos`, `Content-Type: application/json`: autenticação por posse da chave que assina o registro inteiro. Não existe autorização para cunhar, alterar configuração ou escrever em cadeias de terceiros. Autoria válida não equivale a humanidade ou verdade.

SQLite WAL, `synchronous=FULL`, `busy_timeout=5000`, `BEGIN IMMEDIATE`. Restrições `PRIMARY KEY(autor,indice)`, `UNIQUE(autor,pedido)` e hash único; triggers rejeitam UPDATE/DELETE de elos. Idempotência igual retorna 200; novo elo retorna 201; assinatura inválida 401; conflito/fork/lacuna 409. Reuso de pedido com conteúdo diferente é conflito.

Antes da transação, assinatura e evidências são conferidas. Dentro de BEGIN IMMEDIATE, conflitos de sequência/idempotência são recusados antes de gravar objetos. Objetos aceitos são replicados antes do INSERT: falha de I/O/commit pode deixar objeto órfão, nunca promove um objeto a elo aceito. Arquivos são gravados em temporário, sincronizados e ligados atomicamente ao nome por hash, sem sobrescrever destino. Não há mecanismo automático de apagar órfãos, bifurcações ou evidências históricas.

Limites HTTP: 256 KiB, 60 requisições/minuto por IP, até 2.000 entradas no mapa de rate limit, 64 conexões, timeout de requisição 10s e cabeçalhos 5s. Não se confia em X-Forwarded-For. Isso é uma base local, não resistência suficiente a DDoS/Sybil distribuído.

`GET /v2/cadeias/<pubkey>` exporta envelopes assinados. O cabeçalho da exportação não recebe assinatura de uma autoridade central nova; cada elo deve ser revalidado e a continuidade conferida contra checkpoint confiável.

## 4. Índice, arquivos e reconstrução

Índice SQLite é projeção pesquisável dos registros assinados aceitos. O conteúdo assinado é preservado em objetos endereçados por SHA-256, em pelo menos dois diretórios configurados. As evidências são vinculadas por hash. Leituras verificam hash e tentam outra réplica em caso de corrupção. Não há promessa de independência física dos diretórios padrão.

JSON é transporte/exportação dos registros assinados, não substituto do controle transacional. Reconstrução reexecuta validação/assinatura/continuidade para cada registro. Se uma reconstrução falhar no meio, somente o prefixo já verificado fica admitido; não há promoção silenciosa do restante. A política de checkpoint detecta cortes em relação a uma âncora anterior conhecida.

## 5. Transparência e confiança

Folha: SHA-256(0x00 || bytes do registro). Nó: SHA-256(0x01 || hash esquerdo || hash direito). Árvore vazia SHA-256(vazio). Divisão pelo maior expoente de dois estritamente menor que o tamanho. Inclusão e consistência seguem RFC 9162 §2.1.

A âncora deve vir de canal externo autenticado, distribuído previamente ou selecionado conscientemente pelo usuário. Mesma origem não é independência. Autor/log diferente é recusado; tamanho menor sinaliza rollback; mesma posição/tamanho com raiz diferente sinaliza bifurcação; extensão sem prova válida é recusada. O cliente preserva o checkpoint anterior em caso de conflito.

O arquivo preparado nesta entrega não foi publicado por canal independente, por escolha explícita do proprietário. Não é possível garantir detecção de reapresentação no primeiro contato sem âncora anterior confiável. Provas locais não substituem monitoramento/gossip externo.

## 6. Quatro selos e evidência

Resultados separados: integridade, assinatura, prova formal e timestamp; conclusão pode ser `inconclusivo`. Hash/assinatura válidos não produzem prova formal, revisão humana ou verdade. Nenhum kernel novo foi implementado; os certificados da v1 permanecem no escopo original de seus verificadores. Uma futura integração formal deve declarar linguagem, versão de kernel e certificado, e só emitir `conferida` após execução real isolada/conferência.

OTS: a prova sidecar real compromete o arquivo de texto contendo o resumo v1 + LF. Vínculo local e calendário não confirmam Bitcoin. Só validação real contra Bitcoin Core e seis confirmações produz `confirmado_bitcoin`; metadados declarados pelo pacote não bastam. A revisão humana não é inferida de OTS.

## 7. Orçamento e disputas — sem moeda

Orçamento inicial de emissão transferível: zero. Nenhum saldo ou transferência implementado. Reputação também não é concedida automaticamente por número de assinaturas.

Uma futura campanha de avaliação deve ter orçamento pré-financiado e limitado, critério objetivo publicado, revisores com conflitos declarados, evidências endereçadas por hash, prazo de contestação e julgamento independente explicitamente escolhido. Nova evidência cria novo registro; nunca apaga o histórico. Nenhuma penalidade automática por stake até haver regra verificável de infração e procedimento de recurso. Essas são regras de projeto, não um mercado ativo.

Referências: RFC 8785; RFC 9162; https://opentimestamps.org/; https://www.sqlite.org/lang_transaction.html; https://www.postgresql.org/docs/current/transaction-iso.html (modelo de referência; backend implementado nesta entrega é SQLite).
