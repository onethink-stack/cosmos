# Lote cego 1 de registros — registro-v1

O primeiro lote cego do formato aberto (`../../registros-v1.md`): 62 registros
novos, de L01 a L62, com teorias e fórmulas que não estão nos exemplos
normativos. Há válidos e inválidos, embaralhados, e todos vêm escritos como
texto JSON. O lote foi a confirmação da Fase 2: um programa independente, o
leitor de registros do GPT, escrito só pela especificação, tinha de dar as
mesmas respostas do Caderno sem conhecê-las.

## O protocolo

1. O Caderno mandou ao GPT só as entradas (`entradas.json` e `arquivos/`, no
   pacote `lote1-para-gpt.zip`, de 89.863 bytes, SHA-256
   `a186450faab54d51d662a2953491cfb05b27d49a21266a20764be95dc0071b88`). Junto
   foram o protocolo de `LEIAME.md` e o SHA-256 de dois arquivos guardados: as
   respostas do Caderno, com um sal (`caderno.json`), e a previsão do que podia
   divergir (`previsao.txt`).
2. O GPT rodou o leitor congelado da rodada 33, sem o Carcara, e registrou o
   SHA-256 das respostas dele antes de ver as do Caderno.
3. O Caderno revelou `caderno.json` e `previsao.txt`, e os hashes bateram com
   os do compromisso.

| Arquivo | Bytes | SHA-256 | O que é |
| --- | --- | --- | --- |
| `LEIAME.md` | 2.555 | `2d001c454a0c973f9683988ecdc5165e050a27c83b3ee2bca5369d6e33fa44d2` | O protocolo, como foi ao GPT |
| `entradas.json` | 80.938 | `c8776209bdebf9677a1730bdfc734dae3e9c559409d8a0296cfe166f98931b74` | Os 62 registros, cada um em `registroTexto` |
| `arquivos/` | 72 arquivos | no registro que cita cada um | Os problemas SMT-LIB e as provas Alethe |
| `caderno.json` | 10.166 | `5ab1cb73a384bcb58a1c7dea12da8322c7e71a7314ff8066fd0c1b1e5f397b3d` | As respostas do Caderno: o compromisso |
| `previsao.txt` | 4.225 | `b5cff539b47ef063a87b914b1550e8fb23783f7d7c04ae9665a5dc0ce511f5eb` | A previsão, dada antes |
| `respostas-gpt-rodada33.json` | 4.869 | `08e8b61de49d64cdb98a7cfc74ba6227a286d22303889de50ffdd88abefed601` | As respostas do GPT, do código congelado da rodada 33 |
| `respostas-gpt-rodada35.json` | 4.775 | `c7d29b4fdccd16ad1f5f90852e8c75f3ddb5d8451b45c7d20270b5a28684c4eb` | As respostas do GPT, com o avaliador numérico consertado |
| `comparacao-caderno.md` | 10.284 | `ef10b9e38eb6cea7f8fdfefb3ee15a96acbcf9a1a15a4460edc7f95653cdb4fd` | A comparação caso a caso, como foi na revelação |

Cada resposta é `aceito`, `recusado` com o motivo, ou `pendente`, quando só a
prova ficou por conferir. Nas pendentes, `caderno.json` diz em
`previstoComCarcara` o que o Carcara tem de dar.

## O resultado

- **O GPT, com o código congelado da rodada 33:** 58 de 62 iguais às do
  Caderno, no veredito e no motivo. As quatro divergências (L10, L40, L52 e L53)
  estavam na previsão, com os ids. Eram um defeito do avaliador numérico v1 do
  GPT, que recusava modelos exatos certos sem α quando uma comparação de ordem
  era verdadeira: o `BooleanTrue` do SymPy não passava no `res is True`. O
  defeito só recusava demais.
- **O GPT, com o avaliador consertado (rodada 35, duas linhas):** 62 de 62.
- **O lado do Caderno:** o lote também mostrou dois defeitos, que estavam na
  previsão.
  - O leitor do vínculo do verificador público quebrava com um problema com um
    `)` a mais (L46), e a conferência inteira caía.
  - A conferência do app comparava o problema exatamente com a tradução do
    Caderno, e recusava (R9) as asserções em outra ordem (L17) e os nomes da
    tradução do GPT (L40), que a seção 5.1 aceita.

  Os dois estão consertados. O vínculo falha fechado e tem um controle a mais
  (`../../provas-t1/adversarios/comparador/parentese-a-mais-recusar.smt2`). A
  conferência do app usa a comparação da seção 5.1 (`src/motor/vinculo.ts`).
- **O formato:** não mostrou defeito.

## Como é conferido

- `testes/registros.test.ts`: a conferência do Caderno
  (`src/motor/registro.ts`) tem de dar, em cada registro, a resposta de
  `caderno.json`; nas pendentes, fica só a prova por conferir.
- `../../provas-t1/conferir.py`, no fluxo conferir-provas do GitHub (passo 8):
  o verificador público e o leitor de registros do GPT têm de dar a resposta de
  `caderno.json`. Nas 11 pendentes, com o Carcara, eles têm de dar o que ela
  previu: aceito em todas, menos L13, com R10 (a primeira suposição da prova,
  negada, não é asserção do problema).

## Como o lote foi montado

Por um gerador do Caderno, a partir de 18 registros válidos com teorias novas:
funções, □ e ◇, crença, ⊆ e ∉, números (∛2, ∃ sobre ℤ, divisão por zero), uma
teoria inconsistente e registros fechados. Cada inválido tem um defeito sutil,
e cinco têm dois, para testar a ordem da conferência. As provas são do cvc5
1.4.2, com as opções de `../../provas-t1/`, e só usam as regras RARE de
`regras.rare`. Os problemas têm um cabeçalho neutro, e cada registro tem os
seus próprios arquivos (as cópias têm os mesmos bytes), para os nomes não
dizerem de onde ele saiu. Os sais saem de um segredo do Caderno, e não de um
texto público, como nos exemplos. O autor é o SHA-256 da chave pública do teste
1 da RFC 8032 (Ed25519), que não é de ninguém.
