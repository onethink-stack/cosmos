# Cosmos — Provenance Ledger

**Anti-alucinação de integridade e autoria para RAG e agentes - Provenance Ledger.**

Git com assinatura para registros de conhecimento: conteúdo comprometido por SHA-256, autoria por Ed25519, histórico encadeado e evidências rastreáveis. Isso permite detectar adulteração e conferir a chave que assinou. Não é um detector universal de verdade, prova de humanidade ou garantia de que uma resposta de IA é correta.

## Compatibilidade v1

F0–F8 v1 e a chave pública fixa são históricos preservados. Nenhum hash, assinatura, fase ou interpretação foi migrado silenciosamente. `src/dados/pacoteCosmos.ts` gera a exportação no build. `4bd9026d...` é o resumo final da cadeia, não o hash dos bytes do arquivo JSON.

`qsqrt2.ts` representa coeficientes inteiros seguros em ℤ[√2], usa BigInt intermediário e rejeita estouro. Não implementa racionais gerais/divisão de ℚ(√2) e não é função hash.

## Quatro resultados separados

| Resultado | Significado |
|---|---|
| Integridade | Metadados v1 válidos e SHA-256 do conteúdo conferido |
| Assinatura | Assinatura Ed25519 válida sob a chave declarada/fixada para o protocolo |
| Prova formal | Somente uma verificação formal realmente executada pode produzir `conferida`; fichas v1 retornam `nao_aplicavel` |
| Timestamp | Vínculo OTS e confirmação Bitcoin são distintos. A declaração no JSON não confirma nada |

`inconclusivo` é resultado normal: assinatura e hash válidos não provam uma afirmação. A v1 não contém certificados formais das afirmações nem contra-prova humana. Não foi adicionado um kernel formal novo ou executor de código arbitrário.

A conferência dos elos retorna `integridadeCadeia` e `validacaoEnvelopeCompleto`: uma cadeia interna válida não autoriza operações externas. A v1 só aceita o envelope e os metadados históricos previstos, inclusive `carimbo_ots: pendente`; progresso OTS é sidecar.

## Desenvolvimento e testes

Node 22.14 ou compatível, Python 3.10+ para integração OTS:

```powershell
npm.cmd ci
python -m pip install --target node_modules/.cosmos-ots-python -r scripts/requirements-ots.txt
npm.cmd test -- --maxWorkers=1
npm.cmd run typecheck
npm.cmd run build
```

No PowerShell, `npm.cmd` mantém os argumentos `--maxWorkers=1`. A configuração do Vitest também usa um worker por padrão, devido à reserva de memória WASM do Z3. O solver recebe seed padrão explícita `0` e timeout finito por tentativa (20 s por padrão); isso não garante tempos idênticos nem elimina a necessidade do watchdog dos workers. Histórico e limites: [RELATORIO_Z3.md](RELATORIO_Z3.md).

Os testes OTS usam o cliente Python oficial instalado localmente e o recibo real em `public/`; não dependem de respostas online para passar. A API só escuta loopback quando iniciada explicitamente:

```powershell
npm.cmd run v2:api
```

Banco/objetos v2 ficam por padrão em `privado/v2`, ignorado pelo Git. Chaves privadas de usuário não são geradas nem armazenadas por essa API. `COSMOS_V2_DADOS` e `COSMOS_V2_PORT` permitem configuração local. Exposição pública/TLS não foi habilitada.

## OpenTimestamps

Instalação Python acima obrigatória. O cliente JavaScript foi avaliado e removido por dependências vulneráveis; não está no aplicativo. No Windows, a CLI Python 0.7.2 exigiu uma DLL de carteira indisponível. O adaptador usa diretamente a biblioteca oficial de timestamp/calendário 0.4.5, sem módulo de carteira.

```powershell
npm.cmd run ots:stamp
npm.cmd run ots:upgrade
npm.cmd run ots:verify
```

O alvo `public/cosmos-502426c-resumo.txt` contém o resumo da cadeia em hexadecimal + LF. O arquivo `.ots` compromete o **SHA-256 desse alvo**, não os bytes de `cosmos-502426c.json`. A inspeção local usa o parser oficial, confere o vínculo e jamais confirma Bitcoin por conta própria.

Estados: `pendente` → `enviado_calendario` → `confirmado_bitcoin`. Dois calendários responderam; o recibo real está salvo. `public/cosmos-ots-status.json` é um relatório operacional, não uma prova autoautenticada e não é usado para acender verde na UI. A confirmação exige cabeçalho obtido de Bitcoin Core local, vínculo validado pela biblioteca oficial e pelo menos seis confirmações.

Para verificar com seu nó, configure `COSMOS_BITCOIN_RPC_URL` (apenas loopback), `COSMOS_BITCOIN_RPC_USER` e `COSMOS_BITCOIN_RPC_PASSWORD` no ambiente. Nunca coloque credenciais no Git. O programa só chama `getblockcount`, `getblockhash` e `getblockheader`. Não envia transações nem usa carteira.

## Checkpoint e continuidade

```powershell
npm.cmd run v2:checkpoint
```

`public/cosmos-checkpoint-v1.json` contém raiz Merkle, provas de inclusão e consistência das nove folhas históricas. A construção e as provas seguem os algoritmos Merkle de RFC 9162; o projeto não se declara um servidor TLS Certificate Transparency interoperável.

A home compara com a versão vista anteriormente neste navegador e não substitui checkpoints em caso de rollback/fork. Esse armazenamento local **não é âncora independente**: primeiro contato, cache apagado, alteração do verificador ou controle do aparelho estão fora dessa proteção.

Por decisão do proprietário, o checkpoint foi somente preparado localmente. Publicação independente pendente. Antes de usar a política em rede, distribuir/pinar a raiz por canal externo autenticado e usar `avaliarCheckpoint` com a âncora confiável e provas da extensão. O programa não adivinha um destino nem confia em uma URL fornecida pelo próprio pacote.

## Base multiusuário v2

Veja [especificação versionada](especificacao/cosmos-v2.md). Há admissão autenticada por Ed25519, JSON canônico de um perfil restrito JCS+NFC, limites de tamanho/profundidade, SQLite transacional append-only e objetos por hash em duas réplicas locais configuráveis.

As réplicas padrão são diretórios do mesmo computador: não são redundância entre máquinas ou provedores. Não há moeda transferível, prova de humanidade, revisão humana automática ou garantia de independência entre chaves.

Fontes: [JCS](https://www.rfc-editor.org/rfc/rfc8785.html), [transparência](https://www.rfc-editor.org/rfc/rfc9162.html), [OpenTimestamps](https://opentimestamps.org/), [SQLite transações](https://www.sqlite.org/lang_transaction.html).
