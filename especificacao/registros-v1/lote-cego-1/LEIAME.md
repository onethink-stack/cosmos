# Lote cego 1 de registros (registro-v1)

São 62 registros, de L01 a L62, todos novos: as teorias e as fórmulas não estão nos exemplos normativos. Há
válidos e inválidos, embaralhados, e nada diz qual é qual. Alguns inválidos têm dois defeitos; aí vale o motivo do
primeiro passo da ordem da seção 7 de `registros-v1.md`. Cada registro vem escrito como texto JSON, no campo
`registroTexto` de `entradas.json`, e tem de ser lido como texto (a seção 2 recusa a chave repetida). Os caminhos dos
arquivos dos certificados são relativos à pasta de `entradas.json`.

## O que fazer

Conferir cada registro só pela especificação, no commit dac2368 (os mesmos bytes do pacote `fase2b-para-gpt.zip`):

| Arquivo | Bytes | SHA-256 |
| --- | --- | --- |
| `especificacao/registros-v1.md` | 15289 | `ca61687eddbedd5b158a0c77768522abcbb3abaa93b2352110076ff26b47007a` |
| `especificacao/modelos-exatos-t1.md` | 8913 | `fc17eac43eb8f2b95df186879545f55480aac0e367e9bbc2976c3a03d4b8e56b` |
| `especificacao/traducao-z3-t1.md` | 10576 | `abce21ce9786b19e914c0f829f6e3739f56d71645f50587c15f2f3eae6b248bf` |
| `especificacao/gramatica-m2.md` | 23870 | `f38d7af13e18b5acb731cf62a3bb5d1c4592659d21dfd221c060d4383df1d5dc` |
| `especificacao/lexico-m2.json` | 32461 | `0fa7876fabecb42ae4fddb9ea8c7c12a7288b802dac393a49f3c32457215266c` |
| `especificacao/provas-t1/README.md` | 20031 | `3c0ff0bd347322e23b4213f8ebe5a2e465beeae4800f84ae7b4859f4271af2bd` |
| `especificacao/provas-t1/regras.rare` | 3273 | `ffbfc076411a039624a55dfbb9f0c588996aeac10bb8e72161cd64039b071fad` |

Sem o Carcara: uma prova fica pendente. Para cada registro, um destes resultados:

- `aceito`;
- `recusado`, com o `motivo` (R1 a R12);
- `pendente`, quando só falta a prova.

## A resposta

Um arquivo JSON, assim:

```json
{"lote": "registros-cego-1", "resultados": [{"id": "L01", "veredito": "recusado", "motivo": "R4"}, {"id": "L02", "veredito": "pendente"}]}
```

Junto, o SHA-256 dele e o código usado, com os SHA-256 de cada arquivo. Tudo antes de ver as respostas do Caderno.

## O compromisso do Caderno

| Arquivo | Bytes | SHA-256 |
| --- | --- | --- |
| `caderno.json`: as respostas do Caderno, com um sal | 10166 | `5ab1cb73a384bcb58a1c7dea12da8322c7e71a7314ff8066fd0c1b1e5f397b3d` |
| `previsao.txt`: onde o Caderno prevê divergência, e por quê | 4225 | `b5cff539b47ef063a87b914b1550e8fb23783f7d7c04ae9665a5dc0ce511f5eb` |

Os dois só são mostrados depois que a resposta do GPT chegar. Depois disso, o verificador público confere as provas
pendentes com o Carcara.
