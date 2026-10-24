# V4 — laboratório local de autoria, HD e emissão simulada

Data de referência: 2026-10-23, America/Sao_Paulo. Autorização: implementação local, sem deploy, sem rede pública ou carteira real. Base Git preservada em `2a4deec0df6635ff5ab4775b1ee7bab415962b39` / tag `v2`; V3 permanece no working tree. Nenhum commit/tag/push/deploy nesta tarefa.

## Fato → fonte → limite

| Fato | Fonte | Limite |
|---|---|---|
| Cofre novo gerado no aparelho com CSPRNG de 256 bits | `src/v4/carteira.ts`, `criarCofreTeste` | Seed binária, sem frase BIP39, sem importação, sem exportação em claro. Sem backup nesta entrega; perda da senha/armazenamento perde a carteira de teste |
| AES-256-GCM com IV de 96 bits, sal de 128 bits e PBKDF2-SHA256/600.000 iterações; chave AES não extraível | Mesmo módulo | Resistência depende da senha e do ambiente. Não protege de XSS, extensão maliciosa, malware ou comprometimento do aparelho/origem |
| Cofre cifrado persistido em namespace próprio do localStorage; Web Lock impede duas criações concorrentes na mesma origem compatível | `src/ui/v4/Laboratorio.tsx` | Somente envelope cifrado, não seed/chave em claro. Não importa/substitui o cofre histórico. Parser recusa corrupção em vez de tratá-la como cofre vazio. Não há garantia de apagamento completo em memória/GC |
| BIP32/secp256k1, caminho `m/44'/1'/0'/0/x`, último índice entre 0 e 2³¹−1 | `src/v4/carteira.ts`, biblioteca `@scure/bip32` 2.4.0 | Perfil personalizado solicitado pelo proprietário. BIP84 usa `84'` para P2WPKH; outras carteiras podem não descobrir estes endereços automaticamente |
| Pubkey comprimida → HASH160 → witness v0 Bech32 com prefixo `tb` | Mesmo módulo; vetor BIP173 em teste | Apenas endereço com formato testnet. Não há consulta de saldo, RPC, PSBT, assinatura de transação Bitcoin ou broadcast. Uma rede Bitcoin regtest normalmente usa outro prefixo; esta entrega não monta um nó Bitcoin |
| Perfil básico assinado em secp256k1 sob chave derivada do índice 0 | `assinarPerfilLocal`, `verificarPerfilLocal` | Assinatura de perfil com domínio explícito, sem atestado civil/pessoa única/anti-Sybil. Não autoriza transferências Bitcoin nem assina o genesis. Apelido é local e não é publicado |
| Chave Ed25519 histórica isolada | Módulos V4 não importam selo, assinador Ed25519 ou arquivos privados | V1 preservada. Nenhuma migração silenciosa da identidade antiga |
| Mint no genesis de uma simulação nova, padrão 1.000.000, configurável entre 1 e 1.000.000.000 unidades inteiras sem valor | `src/v4/localnet.ts` | Ledger lógico em memória, não uma localnet blockchain entre processos. Destinatário é `demo:solicitante`, não um UTXO Bitcoin ou saldo da carteira HD. Não há API de emissão adicional no estado existente; qualquer nova sessão pode reiniciar uma simulação independente |
| Genesis JCS/SHA256 registra supply, queima e pubkey do perfil iniciador | Mesmo módulo | Hash não é assinatura do genesis, consenso, checkpoint independente ou prova de personhood |
| Trava V3 reutilizada conserva supply, paga e queima com BigInt | `src/ui/v3/SimuladorTrava.tsx`, `src/v3/escrowSimulado.ts`, testes V4 | Motor V3 não foi modificado. Em V4 o botão de reiniciar fixture é ocultado para não trocar o supply do genesis por 1000. Certificados continuam fixtures, não provas Carcara reais |
| Operações da UI disponíveis somente em loopback | `somenteHostLocal`, tela `#/laboratorio` | Guarda de UI, não autenticação, sandbox ou controle sobre código alterado localmente. Não há transportes de rede em `src/v4/` ou `src/ui/v4/` |

## Dependências e fontes

Instaladas versões fixas 2.4.0 de `@scure/bip32`, `@scure/base`, `@noble/hashes`; dependência transitiva `@noble/curves` 2.4.0. Instalação com `--ignore-scripts --no-audit --no-fund`; sem nova auditoria de vulnerabilidades ou alegação de auditoria própria das bibliotecas. Lockfile atualizado. Licenças MIT copiadas para `LICENSES/`, avisos e inclusão no HTML offline atualizados.

- [BIP32: derivação e vetores](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki)
- [BIP44: hierarquia](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
- [BIP84: propósito 84 para P2WPKH](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki)
- [BIP173: Bech32 e vetor testnet](https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki)
- [scure/bip32](https://github.com/paulmillr/scure-bip32)

## Validação

- Referência antes de V4: `evidencias/v4-base-suite.log`, 781/781, 55 arquivos, 217,32 s.
- Testes direcionados: `evidencias/v4-testes.log`, 14/14, 8,43 s. Cofre/autenticação, adulteração de cifra/sal/IV, KDF inválida, JSON duplicado e acessores sem execução, derivação determinística e limites de índice, vetor BIP32, vetor testnet BIP173, assinatura e adulteração do perfil, NFC, supply/queima e gasto duplo. Somente fixtures/segredos efêmeros em memória; nenhuma seed registrada em log.
- Typecheck: `evidencias/v4-typecheck.log`, aprovado após corrigir a tipagem de uma entrada propositalmente inválida do teste.
- Build: `evidencias/v4-build-final.log`, aprovado após o último ajuste de texto/licenças. Nova entrada mantém barreira contra runtime Z3.
- Suíte completa após V4: `evidencias/v4-suite-final.log`, **795/795 testes, 56 arquivos, zero falhas, 217,32 s**. Incremento explicado por 781 + 14 testes V4. Nenhuma alegação de remoção definitiva de intermitência histórica do Z3.
- Conferência visual: tela aberta em loopback (`evidencias/v4-laboratorio.png`), criação ainda não acionada; não se declara uma carteira pessoal criada nem um mint persistente. Testes de armazenamento concorrente entre abas, recuperação após falha de disco e execução em aparelho físico não foram demonstrados.
- Preservação: `evidencias/v4-preservacao.json` confere quatro SHA-256 v1, exportação do build `9e4d4fd1…` e prova OTS. O JSON exportado é gerado por `src/dados/pacoteCosmos.ts`: não existe um arquivo separado `public/cosmos-502426c.json` neste checkout. Uma primeira tentativa de diagnóstico esperava esse caminho inexistente e foi corrigida para conferir o artefato real, sem criar/modificar dados. Sem diff em dados v1 ou ícones PWA. HEAD/tag v2 preservados e índice sem staging.

## Uso local

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 4174
```

Abrir `http://127.0.0.1:4174/cosmos/#/laboratorio`. Escolher uma senha **exclusiva de teste**; gerar cofre uma vez; redigitar senha para derivar endereço público ou assinar perfil. A senha é limpa do campo após cada operação e não é colocada em estado Preact/localStorage/log. Depois do perfil válido, configurar supply/queima e iniciar o genesis da sessão. A memória do ledger se perde ao navegar para outra tela ou recarregar; o cofre cifrado permanece na origem.

Sem Bitcoin Core, Sepolia, servidor público, conexão de carteira, transferência de ativos, custódia, emissão econômica, prova de humanidade, consenso distribuído ou parecer jurídico. OTS e âncora independente continuam pendentes e não foram consultados/modificados.
