# Registros de exemplo — registro-v1

Esta pasta tem os registros de exemplo do formato aberto
(`../registros-v1.md`), válidos e inválidos, com os arquivos dos certificados.
São eles que uma conferência independente tem de ler e conferir.

| Arquivo | O que é |
| --- | --- |
| `exemplos.json` | Os 26 exemplos: 9 válidos (R01 a R09) e 17 inválidos (R10 a R26), cada um com o veredito esperado e, nos inválidos, o motivo |
| `arquivos/` | Os problemas SMT-LIB (a tradução t1 do conjunto que o certificado confere) e as provas Alethe do cvc5 1.4.2, das refutações e da marca `vazio` |

## Os válidos

| Exemplo | Afirmação | O que mostra |
| --- | --- | --- |
| R01 | segue | Todo P é Q, e a é P; logo a é Q. Refutação e modelo das premissas |
| R02 | nao-segue | De "todo P é Q" não sai que a é Q. Modelo finito |
| R03 | consistente | "a é P" cabe junto com "todo P é Q" |
| R04 | contradiz | Se todo P é Q e a não é Q, a não é P |
| R05 | segue | A e ¬A, com a marca `vazio`: o registro só diz que as premissas não têm modelo |
| R06 | segue | Uma lei da lógica, sem premissas: não se pede modelo das premissas |
| R07 | nao-segue | Com números: de n · n = 2 não sai n > 0. Modelo exato, com n = −√2 |
| R08 | consistente | Com crença: Ana crer que a é P cabe junto com a não ser P |
| R09 | nao-segue | O R02 fechado: só o compromisso |

Os inválidos têm um defeito cada, montado a partir de um válido com os outros
hashes refeitos, e cobrem os doze motivos de recusa da seção 7 da
especificação, entre eles a teoria inconsistente sem a marca `vazio` (R22) e a
marca `vazio` com a prova de outra teoria (R24).

## Como são conferidos

- `testes/registros.test.ts`: a conferência do Caderno (`src/motor/registro.ts`),
  que faz tudo menos a prova Alethe.
- `provas-t1/registros.py`, no fluxo conferir-provas do GitHub: a leitura e a
  tradução são as da implementação independente (`provas-t1/independente/`),
  o modelo finito passa pela conferência independente, e a prova, pelo Carcara.
  O modelo exato do R07 fica com a conferência do Caderno até a independente
  entrar no verificador.

Os exemplos saem de um gerador do Caderno, com o cvc5 1.4.2 e as mesmas opções
das provas de `provas-t1/`; o gerador recusa uma prova que use regra RARE fora
de `provas-t1/regras.rare`. O autor dos exemplos é o SHA-256 da chave pública do
teste 1 da RFC 8032 (Ed25519), que não é de ninguém. O sal de cada exemplo é
fixo, para os arquivos saírem sempre iguais; num registro de verdade, ele é
aleatório.
