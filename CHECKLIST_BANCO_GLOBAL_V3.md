# Banco global Cosmos — checklist de aceitação

Baseado no texto do pedido. As páginas originais da SUMA não foram anexadas; não se declara conferência documental das páginas 10, 19 ou 20. F0–F8 v1 permanecem históricos; os marcos de implantação abaixo não redefinem suas fases.

## Evidência obrigatória por execução

Registrar versão do formato/verificador, hashes dos arquivos de entrada, comandos, código de saída, estado antes/depois de cada nó e artefatos das recusas. Os três notebooks devem ter armazenamento separado; testar três objetos no mesmo processo não substitui isso. Marcar um item na UI é somente planejamento.

| ID | Cenário | Procedimento | Critério objetivo | Estado nesta entrega |
|---|---|---|---|---|
| G01 | Fórmula alterada | Modificar um byte no registro exportado, mantendo assinatura/certificado anteriores | Nenhum nó admite; hash/assinatura/vínculo com problema diverge | Regressões locais de integridade existem; teste físico pendente |
| G02 | Duplicata | Reenviar o mesmo pedido; depois reutilizar ID com conteúdo diferente | Igual é idempotente; diferente retorna conflito; contagem não aumenta indevidamente | Cobertura local v2; teste de replicação pendente |
| G03 | Conclusão falsa | Enviar prova inválida, prova de outro problema, `holey`, saída zero sem `valid` e contramodelo incompatível | Não emitir “provado” nem “não segue” sem certificado/modelo correspondente conferido | Adaptador novo falha fechado; Carcara real não executado aqui |
| G04 | Nó desligado | A/B continuam; C volta com prefixo antigo; trocar arquivos e conferir provas de continuidade | Recuperar extensão íntegra ou recusar fork; nunca substituir estado maior por corte silencioso | Rede real não executada |
| G05 | Conflito/fork | Mesmo autor assina dois elos para o mesmo índice | Guardar evidência do conflito; nenhuma fusão silenciosa ou decisão de consenso inventada | Recusa local testada; consenso distribuído pendente |
| G06 | Convergência | Três máquinas importam o mesmo conjunto admissível e comparam raiz/cabeça | Estado igual sob regra de ordenação explicitamente aprovada; assinatura do autor continua verificável | Ordenação/consenso global aguardam arquitetura |
| G07 | Rollback e primeiro contato | Reapresentar exportação antiga; repetir em nó sem histórico | Com âncora confiável: recusar rollback; sem âncora: declarar limite | Merkle/local v2 testado; publicação externa pendente |
| G08 | Unicode e JSON adversarial | Duplicação escapada, inteiro inseguro, não NFC, profundidade/tamanho excessivos | Recusa explícita sem normalizar bytes assinados nem inicializar estado vazio por erro | Regressões v2 existentes |
| G09 | Concorrência real | Dois processos/dispositivos gravam IDs conflitantes simultaneamente | Unicidade e transação preservadas, erro recuperável, sem admissão parcial | Teste atual de duas conexões no mesmo processo não comprova isto |
| G10 | Corrupção e queda de energia | Corromper uma/todas as réplicas; interromper entre arquivo, link e commit SQLite | Detectar corrupção e reconciliar banco/objetos sem promover dados não conferidos | Corrupção local testada; power loss não ensaiado |
| G11 | Recursos | Corpos grandes, conexões lentas, exportações enormes, CPU do verificador, disco cheio | Limites medidos; paginação/quotas; sem crescimento ilimitado ou bloqueio de serviço | API v2 experimental; quotas/paginação/isolamento forte pendentes |
| G12 | Privacidade | Inserir sentinela em nota/cofre privado e pesquisar no catálogo público | Não ler/indexar conteúdo privado; exportação pública não contém sentinela/chave | Nova busca usa apenas lista explícita de campos públicos; teste com cofre real pendente |
| G13 | Licenças e procedência | Conferir AGPL no código, CC BY no material aplicável e exceções de terceiros | Preservar atribuições e registrar licença de cada objeto; não reclassificar material privado | Licenças existentes mantidas; moeda/asset final não recebido |
| G14 | OTS | Atualizar a mesma prova e conferir contra Bitcoin Core e alvo exato | Confirmado só após verificação real; preservar recibo original e evidências | `enviado_calendario`; nenhum upgrade nesta entrega |

## Trava de oferta — somente simulação aprovada

Arquivo: `src/v3/escrowSimulado.ts`. Testes: `testes/v3-escrow.test.ts`.

| Ataque/caso | Resultado exigido no cenário | Limite |
|---|---|---|
| Conta fictícia fora da fixture | Recusar ator desconhecido | Lista fechada não é prova de pessoa única; não resolve Sybil real |
| Pagar a si mesmo | Recusar solicitante igual ao provedor | Identidade real continua pendente |
| Conluio dos dois atores | Unidades conjuntas não aumentam; queima reduz o total disponível | Modelo não contém subsídio/emissão/reputação: não prova segurança do U(φ), B_t ou w_i |
| Gasto duplo | Recusar entrada já consumida e liquidação repetida | Sem consenso distribuído; máquina local determinística |
| Spam | Recusar após limite total configurado, sem mutar estado anterior | Não é teste DDoS de rede |
| Certificado errado | Fixture inválida ou de outro compromisso não libera | Fixture aceita não é prova Alethe real; UI mantém distinção |
| Expiração | Reembolso integral só ao solicitante após prazo; nunca após liquidação | Relógio artificial de cenário; tempo de consenso não foi definido |
| Queima | Inteiros BigInt; `floor(valor × bps / 10000)`; conservação | Regra de teste configurável, não política econômica aprovada para produção |

## Antes de qualquer moeda/rede de teste real

Ainda requer decisões explícitas do proprietário: identidade e recuperação, consenso/ordenação, política de emissão e queima, mecanismo de disputas, carteira HD e auditoria do cofre, limites/quotas, monitoramento independente e avaliação jurídica. Nada disso foi considerado aprovado pela autorização de simulação local. Não há promessa de “nenhum ataque dá lucro” fora dos casos finitos testados.
