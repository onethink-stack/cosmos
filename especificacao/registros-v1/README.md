# Registros de exemplo — registro-v1

Esta pasta tem os registros de exemplo do formato aberto
(`../registros-v1.md`), válidos e inválidos, com os arquivos dos certificados.
São eles que uma conferência independente tem de ler e conferir.

| Arquivo | O que é |
| --- | --- |
| `exemplos.json` | Os 28 exemplos: 10 válidos (R01 a R09 e R27) e 18 inválidos (R10 a R26 e R28), cada um com o veredito esperado e, nos inválidos, o motivo |
| `arquivos/` | Os problemas SMT-LIB (a tradução t1 do conjunto que o certificado confere) e as provas Alethe do cvc5 1.4.2, das refutações e da marca `vazio` |
| `lote-cego-1/` | O lote cego 1: 62 registros novos, com as respostas que o Caderno registrou antes das do GPT, a previsão e as respostas do GPT (veja o README da pasta) |

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
| R27 | segue | Com números: de Q(n) sai que algum número é Q. A tradução do Caderno declara `n:n` e `p:Q/1:R`, e outra pode declarar `c:n` e `p:Q/1`: a comparação vai pelo nome-base e pela assinatura |

Os inválidos têm um defeito cada, montado a partir de um válido com os outros
hashes refeitos, e cobrem os doze motivos de recusa da seção 7 da
especificação. Entre eles estão a teoria inconsistente sem a marca `vazio`
(R22), a marca `vazio` com a prova de outra teoria (R24) e o registro escrito
com uma chave repetida (R28, dado em `registroTexto`).

## Como são conferidos

- `testes/registros.test.ts`: a conferência do Caderno (`src/motor/registro.ts`),
  que faz tudo menos a prova Alethe. O vínculo dela é o da seção 5.1
  (`src/motor/vinculo.ts`), a mesma comparação do verificador público.
- `provas-t1/registros.py`, no fluxo conferir-provas do GitHub, com dois
  leitores. O do verificador usa a leitura e a tradução da implementação
  independente (`provas-t1/independente/`), as conferências independentes de
  modelo e o Carcara. O do GPT (`provas-t1/independente/registros_independente.py`)
  é inteiro dele, escrito só pela especificação, com o comparador SMT dele; as
  provas que ele deixa pendentes vão para o Carcara.

Os exemplos saem de um gerador do Caderno, com o cvc5 1.4.2 e as mesmas opções
das provas de `provas-t1/`; o gerador recusa uma prova que use regra RARE fora
de `provas-t1/regras.rare`. O autor dos exemplos é o SHA-256 da chave pública do
teste 1 da RFC 8032 (Ed25519), que não é de ninguém. O sal de cada exemplo é
fixo, para os arquivos saírem sempre iguais; num registro de verdade, ele é
aleatório.
