# Implementação independente da t1

Estes arquivos foram escritos pelo GPT, da OpenAI, a pedido do autor do Caderno,
só pela especificação. O leitor da gramática m2 saiu de
`especificacao/gramatica-m2.md` e do pacote de conformidade (rodadas 12 a 16); a
tradução t1 e o avaliador de modelos saíram de `especificacao/traducao-z3-t1.md`
(rodadas 18 a 21). O GPT nunca recebeu o código do Caderno: o pacote da t1 que
ele recebeu tinha só a especificação, os 42 exemplos e um manifesto.

Eles estão aqui sem mudança nenhuma, byte a byte como vieram no pacote
`auditoria_z3_cego_2_independente.zip` (rodada 21, 163.738 bytes, SHA-256
`2f43a8c68c978f8bf5f4e7407cc4e080ec955aa354c21c1dfb6ec2e6189cdc11`), com as
linhas em CRLF. O `../conferir.py` confere o SHA-256 de cada um antes de usar.

| Arquivo | O que faz | SHA-256 |
| --- | --- | --- |
| `parser_independente_m2.py` | Lê uma fórmula pela gramática m2 e expande os atalhos | `f416e2b8137b02d0f64c55efa7ef9955fdda95d028a58231d99576f14f73d2f7` |
| `validador_independente_m2.py` | Os diagnósticos da m2 | `8482f9d89ce4971e031b3f2eeb9f50a26faa721c18e3d9015a53eea6c3ac54de` |
| `tradutor_t1_independente.py` | Traduz as fórmulas para SMT-LIB pela t1, em Python puro, sem o Z3 | `59c711b1f36d43d4c524c4536c1c2b0242da5d1c174ddc881b3aee0f0c45ef58` |
| `avaliador_kripke_puro.py` | Avalia uma fórmula num modelo de Kripke finito, sem o Z3 | `86400fe1c7b7349579c3c7193d40c27763a1888d29f2b9fa71c567bdd4fca272` |
| `verificar_certificados_sem_z3.py` | Confere um modelo: forma, tabelas totais, quadro KD45 e a verdade das fórmulas no mundo real | `36329ac9c336f4e011d33912be7cad07adf049d0392fb1a35dfc2c90d5493b15` |
| `lexico-m2.json` | O léxico da m2, que o leitor carrega da própria pasta | `0fa7876fabecb42ae4fddb9ea8c7c12a7288b802dac393a49f3c32457215266c` |

O `lexico-m2.json` daqui tem o mesmo conteúdo de `../../lexico-m2.json`, e o
`conferir.py` confere isso.

Três arquivos vieram depois, no pacote
`auditoria_independente_registros_v1_fase2.zip` (Fase 2, 100.663 bytes,
SHA-256 `c6f65fe2d3baccc3425712267dcf868d03a698ffba5dd0cbeab2ef2159fb99be`),
também sem mudança nenhuma:

| Arquivo | O que faz | SHA-256 |
| --- | --- | --- |
| `verificar_finito_reforcado.py` | O `verificar_certificados_sem_z3.py` com cada `assert` trocado por um `ValueError` e sem os limites da busca do lote cego (5 objetos, 3 mundos). É uma transformação mecânica da árvore do Python, e o `conferir.py` a refaz e confere que dá este arquivo | `21c56ea78a4e6e9c4e26c477bd81f68518349ee38ca3ca1feb89a171f113627e` |
| `avaliador_kripke_numerico_v1.py` | Confere um modelo exato (`../../modelos-exatos-t1.md`), com números em Q(α), sem o Z3; usa o SymPy | `0c8d988e6823e99dea3b6c6ac6acc44f04705587c07525fd1e13fb1827e01a2d` |
| `registros_independente.py` | O leitor de registros (`../../registros-v1.md`), escrito só pela especificação, com comparador SMT próprio (não usa o `../vinculo.py`) | `e4459498da4df97507f191a92f1bf504c5afb1189a4370b0b4a7757102e8634e` |

O avaliador numérico é o da rodada 30 com os três defeitos de correção
consertados: a testemunha só em polaridade positiva, os `assert` trocados por
exigências explícitas, e ∅ como objeto. O leitor de registros foi conferido aqui
nos exemplos de `../../registros-v1/`, e o que ele ainda faz diferente da
especificação está em `../README.md`.

O que já foi conferido com eles:

- o leitor deu as mesmas respostas do Caderno nos 185 exemplos normativos da m2
  e nos lotes cegos de 750 e 1.000 casos;
- a tradução decidiu os 42 exemplos da t1 e os dois lotes cegos do Z3, de 300
  casos cada, sem nenhum veredito oposto ao do Caderno;
- o avaliador conferiu os 90 modelos do Caderno no lote cego Z3 2.

Aqui, o `conferir.py` usa o leitor e a tradução para refazer o problema de cada
certificado a partir das fórmulas, e o compara com o problema do certificado
(veja `../README.md`).

Estes arquivos estão no repositório nos termos de `../../../LICENCAS.md`, como
código.
