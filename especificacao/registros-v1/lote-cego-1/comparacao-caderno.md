# Lote cego 1 de registros: a comparação

As respostas do GPT (`respostas_independentes_rodada33_congelada.json`, SHA-256 `08e8b61de49d64cdb98a7cfc74ba6227a286d22303889de50ffdd88abefed601`), do leitor congelado da rodada 33, contra
as do Caderno (`caderno.json`, SHA-256 `5ab1cb73a384bcb58a1c7dea12da8322c7e71a7314ff8066fd0c1b1e5f397b3d`, o compromisso dado antes, intacto). A previsão
(`previsao.txt`, SHA-256 `b5cff539b47ef063a87b914b1550e8fb23783f7d7c04ae9665a5dc0ce511f5eb`) também foi dada antes.

**Iguais no veredito e no motivo: 58 de 62.** As divergências são L10, L40, L52, L53: as quatro do item 1 da
previsão, com os ids que ela deu. O avaliador numérico v1 recusa os modelos exatos certos sem α em que uma comparação de
ordem é verdadeira com diferença não nula (o `BooleanTrue` do SymPy no `res is True` da linha 483). É um defeito de uma
das conferências, não do formato: os modelos são n = 3 e m = 4 para n > 2 e m = n + 1, e n = 4 com k = 2 para n > 3 e
∃k∈ℤ (k · k = n).

O resto da previsão: o leitor do GPT deu R9 no problema mal formado (item 3), e acertou todos os casos do item 4. As
pendentes vão para o Carcara no verificador público (item 5).

As respostas do GPT foram refeitas aqui com a cópia do leitor congelado que está no repositório (hashes conferidos), nas
mesmas entradas: as mesmas 62.

As duas últimas colunas são as conferências do Caderno, como rodaram antes do compromisso (não fazem parte dele): o app
(`src/motor/registro.ts`, que compara o problema exatamente com a tradução do Caderno: item 2 da previsão) e o
verificador público (`especificacao/provas-t1/registros.py`, com o vínculo consertado do item 3 e o avaliador v1 do GPT:
item 1).

| Id | O caso | Caderno | GPT (rodada 33) | App | Verificador público |
| --- | --- | --- | --- | --- | --- |
| L01 | o L53 com o problema do L10 e um modelo das premissas falso (n = 1) | recusado, R9 | recusado, R9 | recusado, R9 | recusado, R9 |
| L02 | o L44 fechado | aceito | aceito | aceito | aceito |
| L03 | o L29 como segue (tipo teorema), com o problema de T ∪ {φ}, que é o de contradiz | recusado, R9 | recusado, R9 | recusado, R9 | recusado, R9 |
| L04 | o L44 com o hash da teoria feito com os textos das premissas, não com as formas canônicas | recusado, R6 | recusado, R6 | recusado, R6 | recusado, R6 |
| L05 | o L59 com o autor em hexadecimal maiúsculo | recusado, R1 | recusado, R1 | recusado, R1 | recusado, R1 |
| L06 | o L15 com a aridade de mae escrita como texto ("1"), o que não muda os hashes | recusado, R1 | recusado, R1 | recusado, R1 | recusado, R1 |
| L07 | o L24 com a prova da marca vazio num arquivo que não existe | recusado, R8 | recusado, R8 | recusado, R8 | recusado, R8 |
| L08 | não segue, com crença: Ana crer que chove e que a chuva molha não faz estar molhado | aceito | aceito | aceito | aceito |
| L09 | o L15 com uma linha a menos na tabela de mae no modelo das premissas | recusado, R11 | recusado, R11 | recusado, R11 | recusado, R11 |
| L10 | o L53 com as premissas em outra ordem e uma repetida: o mesmo hash da teoria, e o problema com a asserção repetida | pendente → aceito com o Carcara | **recusado, R11** | pendente | recusado, R11 |
| L11 | o L38 com o caminho da prova começando por / | recusado, R8 | recusado, R8 | recusado, R8 | recusado, R8 |
| L12 | o L15 com o hash da teoria do L29 e o SHA-256 do problema errado | recusado, R6 | recusado, R6 | recusado, R6 | recusado, R6 |
| L13 | o L15 com a primeira suposição da prova negada (só o Carcara vê) | pendente → R10 com o Carcara | pendente | pendente | pendente |
| L14 | o L52 com a fórmula sem fechar o parêntese e outro compromisso | recusado, R4 | recusado, R4 | recusado, R4 | recusado, R4 |
| L15 | segue, com função: mesma mãe dá irmãs | pendente → aceito com o Carcara | pendente | pendente | pendente |
| L16 | o L15 com o caminho do problema arquivos/./… | recusado, R8 | recusado, R8 | recusado, R8 | recusado, R8 |
| L17 | o L29 com as asserções do problema em outra ordem (a comparação é por multiconjunto) | pendente → aceito com o Carcara | pendente | recusado, R9 | pendente |
| L18 | o L29 com o compromisso feito com o sal como texto (64 caracteres), não como 32 bytes | recusado, R7 | recusado, R7 | recusado, R7 | recusado, R7 |
| L19 | o L53 com os SHA-256 do problema e da prova trocados | recusado, R8 | recusado, R8 | recusado, R8 | recusado, R8 |
| L20 | o L24 com a marca vazio e uma refutação | recusado, R1 | recusado, R1 | recusado, R1 | recusado, R1 |
| L21 | o L15 com o hash da teoria feito com as premissas na ordem do registro | recusado, R6 | recusado, R6 | recusado, R6 | recusado, R6 |
| L22 | o L38 com o problema sem comentário nenhum | pendente → aceito com o Carcara | pendente | pendente | pendente |
| L23 | o L53 escrito com teoria.nome repetido, com o mesmo valor | recusado, R1 | recusado, R1 | recusado, R1 | recusado, R1 |
| L24 | contradiz com a marca vazio: o barbeiro de Russell não existe | pendente → aceito com o Carcara | pendente | pendente | pendente |
| L25 | o L59 com a fórmula Zero(n): o argumento de um predicado sem ficha pede objeto, e n é número (E15) | recusado, R4 | recusado, R4 | recusado, R4 | recusado, R4 |
| L26 | o L52 com o compromisso feito sobre o campo formula, não sobre o texto da fórmula | recusado, R7 | recusado, R7 | recusado, R7 | recusado, R7 |
| L27 | o L29 sem o modelo das premissas e com a prova num arquivo que não existe | recusado, R12 | recusado, R12 | recusado, R12 | recusado, R12 |
| L28 | o L08 (não segue) com modelo e modelo das premissas | recusado, R1 | recusado, R1 | recusado, R1 | recusado, R1 |
| L29 | contradiz, com □ e ◇: se é necessário que todo humano é mortal e que Sócrates é humano, não é possível que ele não seja mortal | pendente → aceito com o Carcara | pendente | pendente | pendente |
| L30 | o L53 com um modelo finito no lugar do exato | recusado, R11 | recusado, R11 | recusado, R11 | recusado, R11 |
| L31 | o L08 com a afirmação "não-segue" (com acento) | recusado, R1 | recusado, R1 | recusado, R1 | recusado, R1 |
| L32 | o L35 com o estado "sem avaliacao" (sem acento) | recusado, R1 | recusado, R1 | recusado, R1 | recusado, R1 |
| L33 | o L15 com o tipo hipótese e outra forma canônica | recusado, R3 | recusado, R3 | recusado, R3 | recusado, R3 |
| L34 | o L44 com o polinômio 2x³ − 4, que tem a mesma raiz e não é primitivo | recusado, R11 | recusado, R11 | recusado, R11 | recusado, R11 |
| L35 | consistente, com ⊆ e ∉ | aceito | aceito | aceito | aceito |
| L36 | segue sem premissas, com o modelo das premissas (o do conjunto vazio, que a especificação aceita) | pendente → aceito com o Carcara | pendente | pendente | pendente |
| L37 | o L35 com a forma canônica da árvore sem expandir (∉ em vez de ¬∈) | recusado, R5 | recusado, R5 | recusado, R5 | recusado, R5 |
| L38 | segue sem premissas, com crença: a crença é fechada por modus ponens (K) | pendente → aceito com o Carcara | pendente | pendente | pendente |
| L39 | o L15 fechado mostrando o sal | recusado, R1 | recusado, R1 | recusado, R1 | recusado, R1 |
| L40 | o L53 com os nomes do problema e da prova como os da tradução do GPT (c:n no lugar de n:n) | pendente → aceito com o Carcara | **recusado, R11** | recusado, R9 | recusado, R11 |
| L41 | o L15 com mae aplicada a dois argumentos numa premissa (E10) | recusado, R4 | recusado, R4 | recusado, R4 | recusado, R4 |
| L42 | o L53 com o tipo axioma matemático | recusado, R3 | recusado, R3 | recusado, R3 | recusado, R3 |
| L43 | o L29 com "numerico": false na ficha de um predicado, o que não muda os hashes | recusado, R1 | recusado, R1 | recusado, R1 | recusado, R1 |
| L44 | não segue, com números: de n³ = 2 não sai n < 1 (o modelo exato tem n = ∛2, grau 3) | aceito | aceito | aceito | aceito |
| L45 | o L29 sem o modelo das premissas | recusado, R12 | recusado, R12 | recusado, R12 | recusado, R12 |
| L46 | o L29 com o problema mal formado: as linhas das asserções em ordem inversa, e a primeira asserção tem duas linhas (um parêntese fecha a raiz no meio) | recusado, R9 | recusado, R9 | recusado, R9 | recusado, R9 |
| L47 | o L15 sem o modelo das premissas | recusado, R12 | recusado, R12 | recusado, R12 | recusado, R12 |
| L48 | o L35 fechado com o formato registro-v2 | recusado, R2 | recusado, R2 | recusado, R2 | recusado, R2 |
| L49 | o L10 com o problema do L53, que não tem a asserção repetida (a repetição conta) | recusado, R9 | recusado, R9 | recusado, R9 | recusado, R9 |
| L50 | consistente, com uma fórmula que tem o aviso de escopo (E16), que não é erro: ∀x Ave(x) ⟹ Voa(piu) é ∀x (Ave(x) ⟹ Voa(piu)) | aceito | aceito | aceito | aceito |
| L51 | o L15 fechado | aceito | aceito | aceito | aceito |
| L52 | consistente, com ∃ sobre ℤ: n > 3 e n é um quadrado (testemunha inteira) | aceito | **recusado, R11** | aceito | recusado, R11 |
| L53 | segue, com números: n > 2 e m = n + 1 dão m > 3 | pendente → aceito com o Carcara | **recusado, R11** | pendente | recusado, R11 |
| L54 | o L36 com a tradução t2 | recusado, R2 | recusado, R2 | recusado, R2 | recusado, R2 |
| L55 | o L52 com n = 25/4 e a testemunha k = 5/2: k · k = n vale, mas k não é inteiro | recusado, R11 | recusado, R11 | recusado, R11 | recusado, R11 |
| L56 | o L24 com a marca vazio para T ∪ {φ}, não para T | recusado, R9 | recusado, R9 | recusado, R9 | recusado, R9 |
| L57 | o L36 com as duas ligadas numeradas #1 (a numeração é por quantificador) | recusado, R5 | recusado, R5 | recusado, R5 | recusado, R5 |
| L58 | o L29 fechado com o tipo teorema | recusado, R3 | recusado, R3 | recusado, R3 | recusado, R3 |
| L59 | consistente, com divisão por zero: q = 1 / n e n = 0 (D0) | aceito | aceito | aceito | aceito |
| L60 | o L08 com o mundo real sem acesso nenhum para Ana (o quadro não é serial) | recusado, R11 | recusado, R11 | recusado, R11 | recusado, R11 |
| L61 | o L35 com a fórmula ∃x∈x (x ∈ Animais) (E18) | recusado, R4 | recusado, R4 | recusado, R4 | recusado, R4 |
| L62 | o L52 escrito com uma vírgula depois do último campo (JSON inválido) | recusado, R1 | recusado, R1 | recusado, R1 | recusado, R1 |
