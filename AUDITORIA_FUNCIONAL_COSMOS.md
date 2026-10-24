# Auditoria funcional global — Cosmos

Data: 2026-10-23. Escopo: leitura de código, reprodução de fluxo e testes locais. Não é auditoria independente de segurança nem autorização para operar ativos reais. Sem acesso a segredos do aparelho, geração de carteira pessoal, rede pública, commit, push ou deploy.

## Conclusão

O produto tem interfaces navegáveis e componentes criptográficos locais, mas ainda não tem um fluxo integrado de conta → cofre → registro persistente → transferência assinada. Um formulário de login isolado não completa esse fluxo. O saldo ilustrativo do Terminal não é saldo do cofre HD.

### Distinções necessárias

- **Login de serviço:** autentica uma conta perante um servidor. Exige servidor verificador, sessão, expiração, recuperação e política de acesso.
- **Desbloqueio local:** permite usar material cifrado do aparelho. Não cria identidade civil nem garante pessoa única.
- **Autorização de transação:** confirma destino, quantidade, rede e operação, e assina a mensagem exata. Estar logado não substitui essa autorização.
- **Chave privada/seed:** permanece no aparelho. Não deve ser enviada ao servidor, adicionada a Git, mostrada em logs ou pedida no chat. Backup cifrado não é exportação em claro.

## Achados — fato → fonte → limite

Severidade indica impacto na evolução para um sistema operacional; lacuna em uma demonstração identificada não é, por si só, exploração de ativos reais.

| ID | Prioridade | Fato e fonte | Limite / efeito |
|---|---|---|---|
| A01 | Alta | Não existe login/sessão unificada em `src/interfaces/`; `src/ui/v4/Laboratorio.tsx` pede senha a cada operação do cofre | API v2 **tem** admissão por assinatura Ed25519; não se afirma que toda a aplicação é desprovida de autenticação criptográfica |
| A02 | Alta | Terminal usa saldo literal e `setOrdens` em `src/interfaces/Produtos.tsx`; sem transação assinada ou alteração de saldo | Comportamento declarado DEMO. Não demonstra roubo ou transferência real |
| A03 | Alta | `src/v4/localnet.ts` entrega o genesis a `demo:solicitante`; `src/v3/escrowSimulado.ts` aceita atores de cenário e certificado fixture | Cofre HD e ledger econômico estão desconectados. Não basta habilitar Enviar/Receber |
| A04 | Alta | `src/ui/v4/Laboratorio.tsx` persiste o envelope cifrado em localStorage; não há exportação/importação cifrada nem restauração de carteira | Apagar a origem/perder senha pode perder o acesso. O código informa esse limite; não foi testada perda real de cofre pessoal |
| A05 | Alta | V4 usa secp256k1 para perfil local; `src/v2/ledger-node.ts` exige autor/assinatura Ed25519 para admissão | Não existe ponte de autorização entre esses protocolos. Preservar a chave histórica; não substituir uma pela outra silenciosamente |
| A06 | Média | `src/interfaces/Labs.tsx` mantém rascunhos em useState; `src/main.tsx:22` remonta a árvore por rota | Reproduzido: criar rascunho → Terminal → Labs retorna a zero rascunhos. Aviso de sessão não resolve a falta de persistência |
| A07 | Média | Histórico de conversa e ordens são estado de componente em `Produtos.tsx`; ledger V4 é memória na tela | Não há continuidade de trabalho entre interfaces/reloads; sem tentativa de recuperação automática |
| A08 | Média/Alta | `src/interfaces/config.ts` tem endpoints e caminho de comprovados nulos | Conversa é consulta determinística ao catálogo. Não há inferência/RAG/modelo conectado. O comportamento atual avisa esse limite |
| A09 | Média/Alta | `src/ui/v3/Terminal.tsx` calcula hashes de arquivos; `src/v3/carcara-node.ts` é adaptador CLI separado | UI não confere prova Alethe. Não pode liberar pagamento ou declarar prova formal com base apenas em upload/hash |
| A10 | Média/Alta | API v2 é loopback em `src/v2/servidor.ts`; nós da interface são planejados, não conectados | Não há sincronização operacional demonstrada entre três aparelhos. Testes de arquivo não são consenso de rede |
| A11 | Média | Tela Sistemas ainda informava carteira ausente, e Backup dava a entender que o cofre HD não existia | **Corrigido nesta revisão:** diagnóstico diferencia cofre de teste disponível, login ausente, ledger simulado e recuperação pendente |
| A12 | Baixa | Navegação histórica mantinha os nomes I-AI / Hub de Axiomas após renomear as interfaces | **Corrigido nesta revisão:** Cosmos — Conversa, Cosmos Labs e Cofre de teste V4 |

### O que já existe e deve ser reutilizado

- Cofre AES-256-GCM/PBKDF2, geração no aparelho, derivação HD e assinatura/verificação do perfil: `src/v4/carteira.ts`.
- Parser do cofre recusa estrutura, parâmetros, acessores e serialização divergentes. A senha é limpa do campo após as operações existentes.
- Máquina de estados simulada com BigInt, conservação de unidades, trava, liquidação e reembolso: `src/v3/escrowSimulado.ts`. Não é assinatura de transação.
- API v2 valida pedidos canônicos assinados, sequência, idempotência e conflito antes da admissão; SQLite transacional. Não é carteira de moeda nem sessão web.
- Fases v1, elos e exportação assinada histórica: preservar bytes e chaves.

## Ordem de implementação e critério de pronto

| Etapa | Entrega | Testes de aceite mínimos |
|---|---|---|
| 1 — Acesso | Entrada comum nas três interfaces, criar/desbloquear/bloquear cofre de teste, estado de acesso explícito, senha fora de logs/persistência | Senha errada; envelope adulterado; bloqueio/inatividade; aba/reload; erro de storage; origem não local recusada |
| 2 — Recuperação | Exportar/importar envelope **cifrado**, validar antes de substituir, não sobrescrever cofre existente silenciosamente | Backup/restauração em armazenamento temporário; senha errada; truncamento; formato/rede errados; confirmação de substituição |
| 3 — Dados de trabalho | Persistência por titular e domínio de dados; migração versionada; rascunhos, histórico e anexos com recuperação | Criar→navegar→voltar; recarregar; conflito de abas; quota/disco; corrupção diferenciada de ausência; export/import sem perda |
| 4 — Ledger local assinado | Protocolo versionado, rede isolada, destinatário/quantidade explícitos, assinatura vinculada à operação, nonce/idempotência, saldo derivado de eventos | Assinatura errada; alteração de destinatário/valor/rede; replay; gasto duplo concorrente; saldo insuficiente; conservação; reinício/reconstrução |
| 5 — Terminal conectado ao ledger local | Saldo real **do ledger de teste**, receber endereço interno correto, prévia e confirmação de envio, recibo verificável, histórico | UI/ledger concordam; cancelar não transfere; reenvio idempotente; segredo não aparece em payload/log; sessão expirada não assina |
| 6 — Contratos | Oferta vinculada ao problema/certificado exatos, prazo, disputa e queima explicitados | Pagamento único; expiração; certificado inválido/ausente; reembolso; auto-pagamento; conservação |
| 7 — Verificação e AI | Conector de verificação configurado; evidências ligadas aos registros; conector RAG autorizado separado | Hash de problema divergente; verificador indisponível; timeout; sem fonte → não encontrado; documento recuperado não vira prova de verdade |
| 8 — Servidor/rede pública | Arquitetura e autorização novas: conta, política de publicação, recuperação, proteção de sessão, modelo de ameaças, operação e auditoria | Expiração/revogação; CSRF quando aplicável; ACL; limites; autenticação/assinatura separadas; sincronização/fork; avaliação independente antes de ativos reais |

Decisões pendentes antes de implementar operações: conta local ou conta de servidor; titularidade dos dados; protocolo/endereço do ledger COSMOS local (o tb1q atual é formato Bitcoin testnet, não prova de liquidação COSM); vínculo de chaves V4/v2; recuperação; autorização por operação. Nenhum backend, endpoint ou provedor foi inventado.

## Evidências desta revisão

- `evidencias/auditoria-funcional-local-testes.log`: **30/30**, quatro arquivos, 13,02 s, exit code 0. Testes de interfaces, carteira V4, escrow V3 e API v2. Não é nova execução da suíte completa de 801.
- Typecheck e build aprovados: `evidencias/auditoria-funcional-typecheck.log` e `evidencias/auditoria-funcional-build.log`. Quatro hashes v1 e exportação `9e4d4fd1…` conferidos e idênticos após build. HEAD `2a4deec0…`, índice vazio.
- Diagnóstico corrigido conferido após recarga no navegador: `evidencias/auditoria-sistemas-corrigido.jpg`.
- Reprodução no navegador de A06 com texto descartável `AUDITORIA-DESCARTE-LOCAL`, sem leitura de cofre/seed: presente antes da troca e zero rascunhos ao retornar.
- Corrigidos somente os textos de diagnóstico/navegação em `src/ui/v3/Terminal.tsx` e `src/ui/CosmosApp.tsx`; nenhuma operação de carteira/ledger foi habilitada.

## Referências de segurança para a próxima etapa

- OWASP Authentication: reautenticação para operações sensíveis — https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management: sessão de servidor com armazenamento e cookies apropriados; não usar flag de frontend como autorização — https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP HTML5 Security: localStorage é acessível ao JavaScript da origem; não guardar tokens de sessão nele — https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
- W3C WebAuthn: credencial pública requer desafio e verificação pelo relying party; não se implementa um login de servidor só desenhando um botão de passkey — https://www.w3.org/TR/webauthn-3/

Essas referências não transformam o protótipo em produto auditado. O escopo anterior continua local até resposta explícita à pergunta de implementação.

### Atualização após autorização do escopo recomendado

O proprietário aprovou a recomendação local. A implementação posterior está em [ENTREGA_CONTA_LOCAL.md](ENTREGA_CONTA_LOCAL.md): acesso ao cofre, backup cifrado, dados persistentes e ledger local de teste assinado. Os achados acima registram o estado anterior à integração; login de servidor, mercado público, RAG e verificação formal na UI permanecem fora desta etapa. Não há alegação de produto global concluído.
