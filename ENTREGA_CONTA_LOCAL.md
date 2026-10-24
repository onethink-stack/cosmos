# Cosmos — conta, dados cifrados e transferências locais

2026-10-23. Escopo recomendado aprovado: **local de teste**, sem servidor público, ativos reais, custódia, push ou deploy. Não é identidade civil, rede financeira ou consenso entre aparelhos.

## Como usar

1. Abra `http://127.0.0.1:4174/cosmos/#/conta`.
2. Se o cofre V4 já existe nesta origem, desbloqueie com a senha existente; não é gerada outra seed. Caso contrário, crie um cofre com senha **exclusiva de teste** e confirmação.
3. Baixe o backup cifrado. Guarde arquivo e senha separadamente. A senha não pode ser recuperada por e-mail.
4. No Labs, crie/edite rascunhos; na Conversa, consulte o catálogo. Com a conta desbloqueada, ambos são salvos cifrados por titular e recuperados após nova entrada. Sem conta, a biblioteca é pública e as consultas são temporárias.
5. Na Conta ou em Terminal → Portfolio, crie o genesis de uma rede local (padrão 1.000.000 unidades, máximo 1 bilhão). Confirme com a senha. O genesis é assinado; não há remint nessa rede.
6. Para receber, copie o endereço **cosmos-local:**. Para enviar, informe endereço e quantidade inteira, revise rede/valor/destino e confirme com a senha. É uma operação local sem valor financeiro e sem taxa/queima nessa transferência.
7. Exporte o ledger público e troque o arquivo para levar operações a outro ambiente de teste. O destinatário precisa importar a mesma rede e o ledger atualizado. Não há transmissão automática.
8. Verifique o ledger e baixe recibos individuais assinados. Gere novo backup após trabalho/transferências.

`localhost` e `127.0.0.1`, portas e perfis diferentes são **origens diferentes**, com cofres e bancos separados. A restauração exige uma origem sem cofre. A importação não substitui silenciosamente um cofre existente.

## Componentes

| Parte | Implementação | Garantia / limite |
|---|---|---|
| Acesso comum | `src/local/conta.ts`, `src/interfaces/Conta.tsx`, `src/main.tsx` | Desbloqueio local; sessão só em memória. Reload bloqueia. Inatividade de 10 min bloqueia. Alteração do cofre em outra aba bloqueia. Não há cookie/token de servidor |
| Cofre | `src/v4/carteira.ts` reaproveitado | Formato V4, CSPRNG, AES-256-GCM, PBKDF2-SHA256/600 mil iterações. Sem seed/chave privada em claro no armazenamento ou UI |
| Dados | `src/local/dados.ts`, `src/local/banco.ts` | Rascunhos e conversas cifrados com chave não extraível, sal derivado com domínio separado e IV aleatório; AAD vincula titular. IndexedDB faz compare-and-swap transacional |
| Backup | `src/local/backup.ts` e serviços de conta | Cofre/dados cifrados, perfil público e ledger assinado da rede **ativa**. Valida estrutura, resumo, senha e vínculo cofre/titular antes de ativar. Resumo SHA não é autenticação; autenticação depende de AES/assinaturas |
| Operações | `src/local/protocolo.ts` | Domínio `COSMOS/LOCAL/OPERACAO/V1`, secp256k1, formato explícito, valores inteiros em string/BigInt. Rede, autor, destino, valor, índice, anterior, pedido e data são cobertos pela assinatura |
| Persistência do ledger | `src/local/conta.ts`, `banco.ts` | Saldo derivado dos eventos; CAS recusa concorrência sobre revisão antiga. Rejeita replay, anterior errado, saldo insuficiente, outra rede e segundo genesis |
| Endereço | `cosmos-local:<pubkey>:<checksum>` | Chave comprimida secp256k1 com checksum para erros de digitação. Formato privado deste protótipo, não endereço Bitcoin/ATOM/rede pública |
| UI | Conta comum + Portfolio funcional | Overview/Markets mantêm cenários de preço DEMO. Portfolio/Conta mostram saldo real **do ledger local de teste**, separado do saldo ilustrativo 12.847,3921 |

## Decisões e limites explícitos

- Perfil e operações da conta usam o índice 0 do caminho V4 autorizado. A seed permanece cifrada; a senha é solicitada novamente por operação de assinatura e limpa dos campos.
- A sessão retém apenas a chave não extraível de **dados** e o conteúdo aberto em memória; não retém senha, seed ou chave privada de assinatura. JavaScript/GC não oferece garantia de apagamento completo de strings/memória.
- Chaves e bytes históricos Ed25519 não foram acessados, migrados ou reassinados. A API v2 continua independente; sua admissão Ed25519 não foi substituída pela carteira secp256k1.
- O índice 1 pode ser derivado como destinatário **para testar envio**; a interface de envio atual usa o índice 0. Para testar outro titular com capacidade de responder, use outro cofre de teste e seu endereço do índice 0.
- Importação compara prefixos e recusa bifurcação; arquivo antigo não substitui prefixo local mais longo. Isso não impede dois aparelhos desconectados de criar forks ou um dono malicioso de apagar/alterar seu armazenamento. Não é consenso nem proteção independente de primeiro contato.
- Ledger público contém endereços, quantidades, datas declaradas e assinaturas. O backup contém esse ledger e perfil público em claro, enquanto cofre e rascunhos/conversas ficam cifrados.
- Limites: documento canônico/arquivo até 256 KiB; até 500 operações (também sujeito ao limite de bytes), 100 rascunhos, 50 conversas, 50 mil caracteres de conteúdo da conta (também sujeito a bytes). Ao exceder, a gravação é recusada; não se descarta silenciosamente conteúdo antigo.
- Backup inclui somente a rede ativa, não todas as redes já importadas nem o ledger de cenário V3/V4 antigo. O cenário de trava/queima V3 continua separado; esta entrega não libera pagamento por certificado fictício.
- Restauração usa IndexedDB e depois localStorage; não há transação única entre essas APIs. Falha na gravação do cofre pode deixar dados **cifrados** órfãos; repetir o mesmo backup reutiliza bytes idênticos. Dados existentes divergentes não são sobrescritos.
- Cofre cifrado protege armazenamento em repouso. Não protege sessão aberta contra XSS, extensão maliciosa ou aparelho comprometido. Não há avaliação independente para uso com ativos reais.
- Conta e serviços de mutação recusam origens fora de loopback. Nenhum endpoint novo ou biblioteca nova foi instalado.

## Validação

- Novos testes: `testes/conta-local.test.ts`, 21 casos. Criptografia, alteração de payload, replay/gasto duplo, saldo/supply, endereço/checksum, cifra/backup, CAS/atomicidade, corrupção, restauração após falha de quota, vínculo titular/cofre, expiração e bloqueio.
- Primeira execução direcionada: dois testes completos excederam o timeout padrão de 5 s. `evidencias/conta-local-testes-antes.log`. Foram ajustados somente os prazos dos testes longos; KDF de produção preservada.
- Execução direcionada intermediária: 38/38 em três arquivos, 37,11 s — `evidencias/conta-local-testes.log`.
- Suíte completa incluindo os três últimos casos adicionais: **822/822**, 58 arquivos, 250,92 s, exit code 0 — `evidencias/conta-local-suite-completa.log` (801 anteriores + 21 novos).
- Typecheck/build finais: `evidencias/conta-local-typecheck-final.log`, `evidencias/conta-local-build-final.log`. O build informa chunk acima de 500 kB; não é tratado como falha nem como otimização concluída.
- QA no navegador em origem separada `http://localhost:4174`, com conta descartável `qa-descartavel` e credencial pública de fixture, sem uso financeiro. Não foi criado/substituído cofre em `127.0.0.1`.
- UI: genesis de 1 milhão, envio de 80 ao índice 1, saldo 999.920 e recibo `50c18087c0a51cbb8422acc2c6111eef9926075ba2bd56627bf3c6f35e73b8cb`; senha vazia após operação; Portfolio mostra o mesmo saldo. Reload bloqueia, senha recupera saldo e consulta F2. Rascunho permanece entre Labs/Conversa/Conta.
- Download/restauração foram validados pelo código de backup e testes com banco efêmero. Não foi restaurado um backup pessoal nem se declarou teste em celular físico.
- Quatro SHA-256 v1, exportação `9e4d4fd1…` e moeda oficial `ce6539f2…` conferidos e preservados.

## Auditoria anterior — situação após esta etapa

As lacunas de acesso local, backup cifrado, rascunhos/histórico persistentes e transferência local assinada têm implementação nesta entrega. Continuam pendentes: login de servidor, modelo/RAG, Carcara na interface, liquidação por prova real, mercado/cotações externos, staking, consenso distribuído, personhood, OTS confirmado e âncora independente. Não se declara o sistema financeiro/global concluído.

Sem commit, tag, push ou deploy. HEAD permanece `2a4deec0df6635ff5ab4775b1ee7bab415962b39`.
