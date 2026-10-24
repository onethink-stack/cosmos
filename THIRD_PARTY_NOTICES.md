# Avisos de terceiros

O Caderno Lógico inclui, ou leva no app publicado, estes trabalhos de
terceiros, cada um com a sua licença. Os textos completos estão em
[LICENSES/](LICENSES/).

| O quê | Onde | Licença | Texto |
| --- | --- | --- | --- |
| 17 regras de reescrita do Carcara | `especificacao/provas-t1/regras.rare` | Apache-2.0, dos autores do Carcara | [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt) |
| Faixas das classes L e N do Unicode 16.0 | `src/logica/unicode16.ts` | Unicode License V3, © 1991-2026 Unicode, Inc. | [LICENSES/Unicode-3.0.txt](LICENSES/Unicode-3.0.txt) |
| Preact | Empacotado no app | MIT, © 2015-present Jason Miller | [LICENSES/MIT-preact.txt](LICENSES/MIT-preact.txt) |
| TweetNaCl.js 1.0.3 | Assinaturas Ed25519 do selo Cosmos | Unlicense, domínio público | [LICENSES/Unlicense-tweetnacl.txt](LICENSES/Unlicense-tweetnacl.txt) |
| @scure/bip32 2.4.0 | Derivação secp256k1 do laboratório V4 | MIT, Patricio Palladino / Paul Miller | [LICENSES/MIT-scure-bip32.txt](LICENSES/MIT-scure-bip32.txt) |
| @scure/base 2.4.0 | Codificação Bech32 local V4 | MIT, Paul Miller | [LICENSES/MIT-scure-base.txt](LICENSES/MIT-scure-base.txt) |
| @noble/hashes 2.4.0 | SHA-256 e RIPEMD-160 V4 | MIT, Paul Miller | [LICENSES/MIT-noble-hashes.txt](LICENSES/MIT-noble-hashes.txt) |
| @noble/curves 2.4.0 | Dependência secp256k1 de scure/bip32 | MIT, Paul Miller | [LICENSES/MIT-noble-curves.txt](LICENSES/MIT-noble-curves.txt) |
| React / React DOM 19.3.1 | Três interfaces de produto; núcleo histórico Preact separado | MIT, Meta Platforms | [React](LICENSES/MIT-react.txt), [React DOM](LICENSES/MIT-react-dom.txt) |
| shadcn/ui | Button/Input adaptados em `src/interfaces/ui/` | MIT, shadcn | [LICENSES/MIT-shadcn.txt](LICENSES/MIT-shadcn.txt) |
| Radix Slot / Compose Refs | Primitiva dos componentes shadcn | MIT, WorkOS | [Slot](LICENSES/MIT-radix-slot.txt), [Compose Refs](LICENSES/MIT-radix-compose-refs.txt) |
| class-variance-authority 0.7.1 | Variantes de componentes | Apache-2.0 | [LICENSES/Apache-cva.txt](LICENSES/Apache-cva.txt) |
| clsx / tailwind-merge | Composição de classes | MIT | [clsx](LICENSES/MIT-clsx.txt), [tailwind-merge](LICENSES/MIT-tailwind-merge.txt) |
| Tailwind CSS 4.3.3 | Utilitários CSS sem preflight global | MIT, Tailwind Labs | [LICENSES/MIT-tailwindcss.txt](LICENSES/MIT-tailwindcss.txt) |
| JetBrains Mono Regular | Fonte local dos números do Terminal | SIL OFL-1.1, JetBrains | [LICENSES/OFL-JetBrainsMono.txt](LICENSES/OFL-JetBrainsMono.txt) |
| Z3 (pacote z3-solver) | Fonte e testes históricos; dependência de desenvolvimento, fora do runtime web V3/V4 | MIT, © Microsoft Corporation | [LICENSES/MIT-z3-solver.txt](LICENSES/MIT-z3-solver.txt) |
| Trecho de apoio do Vite (o polyfill de `modulepreload`) | Empacotado no app | MIT, © 2019-present, VoidZero Inc. and Vite contributors | [LICENSES/MIT-vite.txt](LICENSES/MIT-vite.txt) |

## Detalhes

- **regras.rare** é uma cópia de 17 regras do arquivo `rewrites.eo` do
  [Carcara](https://github.com/ufmg-smite/carcara), no commit
  `394edbb15ba95c47893f1d821fddde7e016af178`. A única mudança, anotada no topo
  do arquivo, é de escrita: em `or-not-refl`, o parâmetro de tipo `T0` passou a
  ser declarado `@T0`. O Carcara não tem arquivo NOTICE.
- **unicode16.ts** traz as faixas de letras e números dos dados de caracteres do
  Unicode 16.0, como o Node os traz, lidas pelo roteiro
  `scripts/gerar-unicode16.mjs`. A licença do Unicode pede que o aviso dela
  acompanhe os dados ou a documentação deles.
- **Preact, Z3 e o trecho do Vite** vão no app publicado: no site, que leva
  junto este arquivo e a pasta `LICENSES/`, e no arquivo único, que traz os
  avisos num comentário no topo do HTML.

## Dados

- **Constantes físicas** (`src/dados/codata.ts`): valores do CODATA 2018,
  recomendados pelo NIST ([physics.nist.gov/constants](https://physics.nist.gov/constants)).
  São fatos numéricos, e cada nota cita a fonte.
- **Wikidata**: o app consulta o Wikidata na hora (dados sob CC0), e nada dele
  fica no repositório.
- **TPTP**: a biblioteca TPTP não está no repositório. Quem a carrega no
  aparelho segue os termos do próprio TPTP.

## Ferramentas

O build e os testes usam Vite, TypeScript, Vitest e outras dependências de
desenvolvimento, cada uma com a sua licença, que o `npm install` traz para
`node_modules/`. Delas, só o trecho do Vite da tabela vai para o app. O cvc5 e
o Carcara, que geram e conferem as provas, não estão no repositório, além das
17 regras acima. O SymPy e o mpmath (licença BSD de 3 cláusulas, cada um) são
instalados pelo fluxo conferir-provas, nas versões e com os hashes de
`especificacao/provas-t1/requisitos.txt`, para a conferência independente dos
modelos exatos; também não estão no repositório.
