# Registros — formato registro-v1

O registro é a unidade do formato aberto (a Fase 2 do plano): uma afirmação
sobre uma fórmula e uma teoria, com o que se sabe dela e com o certificado que
a confere. Este arquivo vale junto com `gramatica-m2.md` (a leitura e a árvore
expandida), `traducao-z3-t1.md` (a semântica e a tradução),
`modelos-exatos-t1.md` (o modelo com números) e `provas-t1/README.md` (o vínculo
da fórmula com o problema e a conferência das provas). Os exemplos normativos,
válidos e inválidos, estão em `registros-v1/exemplos.json`.

## 1. As afirmações

Seja T a teoria (as premissas) e φ a fórmula do registro.

| `afirmacao` | Quer dizer | O certificado traz |
| --- | --- | --- |
| `segue` | T ⊢ φ: as premissas e ¬φ não têm modelo | a refutação de T ∪ {¬φ}, e um modelo de T |
| `contradiz` | T ⊢ ¬φ: as premissas e φ não têm modelo | a refutação de T ∪ {φ}, e um modelo de T |
| `nao-segue` | T ⊬ φ | um modelo de T ∪ {¬φ} |
| `consistente` | T e φ têm modelo juntos | um modelo de T ∪ {φ} |

**A teoria inconsistente.** Se T não tem modelo, toda fórmula segue de T, e um
`segue` não diz nada. Por isso um `segue` ou um `contradiz` traz um modelo de T,
que mostra que T tem modelo. A alternativa é a marca `vazio`: a prova de que T,
sozinha, não tem modelo, e então o registro diz isso e mais nada. Um registro
que não traz nenhum dos dois é recusado (R12). Com T sem premissas, o modelo de
T não é pedido: o conjunto vazio tem modelo.

## 2. Os campos

O registro é um objeto JSON com estes campos, e só estes, sem chave repetida em
objeto nenhum: os leitores de JSON discordam sobre qual valor de uma chave
repetida fica, e duas conferências leriam registros diferentes (R1). A situação
`aberto`
mostra tudo; a `fechado` esconde a fórmula, as premissas e o certificado, e
guarda só o compromisso (seção 4) até a pessoa revelar.

| Campo | Conteúdo | No fechado |
| --- | --- | --- |
| `formato` | `"registro-v1"` | igual |
| `situacao` | `"aberto"` ou `"fechado"` | igual |
| `afirmacao` | `segue`, `contradiz`, `nao-segue` ou `consistente` | igual |
| `formula` | o texto de φ, na m2 | não vai |
| `formaCanonica` | a forma canônica de φ (seção 3) | não vai |
| `teoria` | `{"nome", "fichas", "premissas", "hash"}` (seção 3) | só `nome` e `hash` |
| `tipo` | `axioma matemático`, `observação`, `hipótese`, `definição`, `norma` ou `teorema` | igual |
| `dominio` | onde a afirmação vale, num texto não vazio que a conferência não interpreta | igual |
| `estado` | `proposta`, `corroborada`, `contestada`, `refutada` ou `sem avaliação` | igual |
| `semantica` | `{"gramatica": "m2", "traducao": "t1"}` | igual |
| `autor` | o SHA-256 da chave pública de quem publica, em 64 dígitos hexadecimais minúsculos | igual |
| `compromisso` | `{"hash", "sal"}` (seção 4) | só `hash` |
| `certificado` | a seção 5 | não vai |

- `tipo` diz o que a fórmula é: um axioma matemático, uma observação, uma
  hipótese, uma definição, uma norma, ou um teorema, que é o que segue da
  teoria. `teorema` vai com `segue`, e `segue` vai com `teorema`; o contrário é
  recusado (R3).
- `estado` é o que o autor declara. A mudança de estado por contestação é da
  Fase 4.
- `teoria.nome` é um texto não vazio, como "Principia v1". O nome é um rótulo:
  fica fora do hash.
- `teoria.fichas` é o dicionário da teoria, com as fichas da seção 4.1 de
  `gramatica-m2.md`. Cada ficha tem só `simbolo`, `tipo` (`constante`, `funcao`
  ou `predicado`), `aridade` (inteiro: 0 na constante, 1 ou mais na função, 0 ou
  mais no predicado, e o de aridade 0 é uma proposição), e, quando servem,
  `numerico` (true ou false, na constante e na função) e `argumentos` (`num` e
  `obj`, um por argumento, na função e no predicado). Não há duas fichas com o
  mesmo símbolo. As premissas e a fórmula são lidas com esse dicionário.
- `teoria.premissas` é a lista dos textos das premissas, na m2, talvez vazia.
- Na Fase 3, `autor` passa a ser conferido por uma assinatura; aqui só se
  confere a escrita.

## 3. A forma canônica e o hash da teoria

**Forma canônica** de uma fórmula: a árvore expandida (seção 5 de
`gramatica-m2.md`), escrita como na seção 6, com cada variável ligada trocada
por `#1`, `#2`, …, na ordem em que o seu quantificador aparece na escrita, da
esquerda para a direita. O domínio de `∃x∈D` é lido fora do quantificador e não
muda de nome por causa dele. Assim `∀y (P(y) ⟹ Q(y))` e `∀x (P(x) ⟹ Q(x))` têm a
mesma forma canônica, `(∀ #1 (⟹ (P #1) (Q #1)))`.

**Linha de ficha**: `ficha <simbolo> <tipo> <aridade> <n> <a>`, separados por um
espaço, com `<n>` igual a `numerico` se a ficha diz `"numerico": true`, ou `-`; e
`<a>` igual aos argumentos separados por vírgula, ou `-`. Exemplo:
`ficha g funcao 2 - num,obj`.

**Texto da teoria**: a linha `teoria-v1`; depois as linhas de ficha do
dicionário; depois uma linha `premissa <forma canônica>` para cada premissa, sem
repetir. As linhas de ficha e as de premissa vão cada grupo na ordem dos pontos
de código, e cada linha termina em `\n` (LF). O **hash da teoria** é o SHA-256
do texto em UTF-8, em hexadecimal minúsculo. Ele não depende da ordem nem da
repetição das premissas, nem dos nomes das variáveis ligadas.

**Texto da fórmula**: a linha `formula-v1`; as linhas de ficha do dicionário,
na mesma ordem; e a linha `formula <forma canônica>`, cada uma terminando em
`\n`.

## 4. O compromisso

O sal tem 32 bytes aleatórios, escritos em 64 dígitos hexadecimais minúsculos.
O compromisso é o SHA-256 dos 32 bytes do sal seguidos do texto da fórmula da
seção 3 em UTF-8 (as linhas `formula-v1`, as de ficha e a `formula`, e não o
campo `formula`), em hexadecimal minúsculo. No registro aberto, o sal vem junto, e a
conferência refaz a conta (R7). No fechado, só o hash vem: a fórmula fica
escondida, e o hash prova depois que ela já existia. Um hash sem sal não
esconde uma frase curta, que se acha testando frases.

## 5. O certificado

Um **arquivo** é `{"arquivo": caminho, "sha256": hash}`. O caminho é relativo à
raiz do conjunto de registros (nos exemplos, a pasta de `exemplos.json`), com
`/`, sem segmento vazio, `.` ou `..`, e não sai da raiz, nem por link
simbólico. O que vale é o SHA-256 dos bytes do arquivo (R8).

O **conjunto** que o certificado confere é a lista das premissas, na ordem do
registro, e depois ¬(φ) em `segue` e `nao-segue`, ou φ em `contradiz` e
`consistente`. O conjunto das premissas é só a lista das premissas. Num modelo
exato, o índice de `formula` nas testemunhas conta nessa lista.

| Campo do certificado | Conteúdo |
| --- | --- |
| `refutacao` | `{"problema": arquivo, "prova": arquivo}`: o problema SMT-LIB que a tradução t1 manda ao Z3 para o conjunto, e uma prova Alethe de que ele não tem modelo |
| `modeloDasPremissas` | um modelo do conjunto das premissas |
| `vazio` | `{"problema": arquivo, "prova": arquivo}`, para o conjunto das premissas: a marca de teoria inconsistente |
| `modelo` | um modelo do conjunto |

As combinações aceitas são estas. Num `segue` ou num `contradiz`, valem três:
`refutacao` com `modeloDasPremissas`; só `refutacao`, quando não há premissas;
ou só `vazio`. Num `nao-segue` ou num `consistente`, vale só `modelo`. Um
`segue` ou um `contradiz` com premissas e só `refutacao` é recusado com R12; as
outras combinações, com R1.

Um **modelo** é o finito do lote cego Z3 2 (seção 6), ou o exato
(`modelos-exatos-t1.md`), que se reconhece pelo campo `formato`.

Para uma refutação, ou para a marca `vazio`, a conferência:

1. refaz o problema a partir das fórmulas e do dicionário, pela tradução t1, e
   o compara com o do arquivo pelo vínculo abaixo (R9);
2. confere a prova com o Carcara, com as regras RARE de `provas-t1/regras.rare`
   (R10). Sem o Carcara, ou com o tempo dele esgotado, a prova fica pendente
   (seção 7), o que não é aceite nem recusa.

### 5.1 O vínculo

O problema do arquivo é a tradução t1 do conjunto quando os dois estão no perfil
da t1 e são iguais a menos da forma.

**O perfil da t1** é o que a tradução emite, e nada mais:

- os comandos `(set-logic ALL)`, `declare-sort`, `declare-fun`,
  `declare-const`, `assert` e `check-sat`, nesta ordem: um `(set-logic ALL)`
  primeiro; as sortes `Obj` e `Mundo`, de aridade 0, uma vez cada; as
  declarações; as asserções; e no máximo um `(check-sat)`, no fim;
- as sortes `Obj`, `Mundo`, `Bool` e `Real`, e `Obj` e `Mundo` só depois de
  declaradas;
- os nomes declarados `w0`, `pertence` e os da seção 3 de `traducao-z3-t1.md`
  (`c:`, `n:`, `f:…/k`, `fn:…/k` e `p:…/k`, com o sufixo `[:sig]` ou sem ele, e
  `R:`), cada um uma vez;
- os operadores `true`, `false`, `not`, `and`, `or`, `=>`, `=`, `+`, `-`, `*`,
  `/`, `^`, `<`, `<=`, `>`, `>=` e `is_int`, e os ligadores `forall`, `exists`
  e `let`; uma variável ligada não tem o nome de um operador nem de um símbolo
  declarado;
- os tipos: cada aplicação de um símbolo declarado com a aridade e as sortes da
  declaração; `not` com um `Bool`; `and`, `or` e `=>` com dois ou mais `Bool`;
  `=` com dois ou mais termos da mesma sorte; `+` e `*` com dois ou mais `Real`;
  `-` com um ou dois `Real`; `/` e `^` com dois `Real`; `<`, `<=`, `>` e `>=`
  com dois ou mais `Real`; `is_int` com um `Real`; o corpo de `forall` e de
  `exists` é `Bool`; e toda asserção é `Bool`.

**A comparação** ignora só o que não muda o sentido:

- os comentários, o `(set-logic)` e o `(check-sat)`, depois do perfil;
- as barras em volta dos símbolos;
- os nomes das variáveis ligadas, numeradas na ordem dos ligadores;
- os `let`, trocados pelos seus termos (um `let` que capturaria uma variável é
  recusado);
- a escrita dos números: `2`, `2.0` e `(/ 4 2)` são o mesmo número, e `(- 2)` é
  −2;
- `and` e `or` aninhados, que se achatam mantendo a ordem dos argumentos;
- a ordem das declarações e a das asserções (as asserções são um multiconjunto:
  a ordem não conta, e a repetição conta);
- as declarações que nenhuma asserção usa;
- e, em cada símbolo declarado, o nome além do **nome-base** e da
  **assinatura**. O nome-base é o nome sem o prefixo (`c:`, `n:`, `f:`, `fn:`,
  `p:`, `R:`) e sem o `/k[:sig]`; a assinatura são as sortes dos argumentos e a
  do resultado. Os nomes da t1 são informativos (seção 3 de
  `traducao-z3-t1.md`), e duas traduções podem nomear diferente: `c:n` e `n:n`
  (`Real`) são o mesmo símbolo, e `p:Q/1` e `p:Q/1:R` (`Mundo × Real → Bool`)
  também, enquanto `P(a)` continua diferente de `P(b)`. Dois símbolos declarados
  no mesmo problema com o mesmo nome-base e a mesma assinatura são recusados.

## 6. O modelo finito

O modelo finito é `{"objetos": n, "mundos": k, "constantes": {nome: objeto},
"funcoes": {"nome/aridade": [[mundo, [argumentos], valor], …]}, "predicados":
{"nome/aridade": [[mundo, [argumentos]], …]}, "pertence": [[mundo, x, y], …],
"acessos": {titular: [[w, v], …]}}`. Os objetos são 0 a n−1, os mundos 0 a k−1, e
o mundo 0 é o real.

- `constantes` traz cada constante de objeto livre no conjunto, inclusive o
  nome de um índice que nenhum quantificador prende, e ∅, se ele aparece.
- `funcoes` traz, para cada função de objeto que aparece (a base de um índice
  também), uma linha para cada mundo e cada lista de argumentos, sem repetir.
- `predicados` traz, para cada predicado que aparece, só as listas verdadeiras.
- `pertence` traz os trios em que x ∈ y naquele mundo; nenhum trio tem como y o
  objeto de ∅.
- `acessos` traz os pares de cada titular, que têm de ser seriais, transitivos
  e euclidianos.

Quem confere checa a forma, o quadro de cada titular e se cada fórmula do
conjunto, na árvore expandida, vale no mundo 0. O modelo finito não tem números:
um conjunto com números pede o modelo exato. O formato não limita o tamanho do
modelo: os limites da busca do motor do Caderno (5 objetos e 3 mundos, nos lotes
cegos) não são do formato.

## 7. A conferência e os motivos de recusa

A conferência dá um de três resultados: **aceito**; **recusado**, com o código
do motivo; ou **pendente**, com o passo que ficou sem conferir (a prova sem o
Carcara, ou um limite de tempo ou de memória). Pendente não é aceite nem recusa.
No registro fechado, o aceite é só da forma: a afirmação fica sem conferir até o
registro ser aberto.

A conferência para no primeiro passo que falha, nesta ordem:
1. a forma (R1, R2, R3);
2. a leitura (R4);
3. os hashes (R5, R6, R7);
4. a combinação do certificado (R1, R12);
5. os arquivos (R8), a refutação ou a marca `vazio` (R9, depois R10);
6. os modelos (R11).

No registro fechado, ela faz só a forma (R1, R2 e R3).

| Código | Recusa quando |
| --- | --- |
| R1 | Falta um campo, sobra um campo ou um campo está mal escrito; uma ficha é mal formada ou repetida; um valor está fora da lista; o certificado tem uma combinação que não vale |
| R2 | O formato ou a semântica não são os desta versão |
| R3 | `teorema` sem `segue`, ou `segue` sem `teorema` |
| R4 | A m2 recusa a fórmula ou uma premissa, lidas com o dicionário da teoria |
| R5 | `formaCanonica` não é a forma canônica da fórmula |
| R6 | `teoria.hash` não é o hash da teoria |
| R7 | `compromisso.hash` não é o compromisso da fórmula com o sal |
| R8 | Um arquivo falta, tem caminho inválido ou outro SHA-256 |
| R9 | O problema não é a tradução t1 do conjunto |
| R10 | A prova não passa no Carcara |
| R11 | A conferência do modelo recusa o modelo |
| R12 | `segue` ou `contradiz` com premissas, sem modelo das premissas e sem a marca `vazio` |

## 8. Exemplos normativos

`registros-v1/exemplos.json` tem, para cada exemplo, `id`, `descricao`,
`esperado` (`{"veredito": "aceito"}` ou `{"veredito": "recusado", "motivo":
código}`) e `registro`. Quando o defeito está na escrita do JSON (uma chave
repetida), o exemplo traz `registroTexto`, o registro como texto, no lugar de
`registro`. Os arquivos dos certificados estão em
`registros-v1/arquivos/`. Cada exemplo inválido tem um defeito só, montado a
partir de um válido e com os outros hashes refeitos, e o motivo esperado é o
desse defeito. Uma conferência independente está conforme quando dá o mesmo
veredito em todos os exemplos; o motivo é informativo, mas, com um defeito só,
ele também deve bater. O autor dos exemplos é o SHA-256 da chave pública do
teste 1 da RFC 8032 (Ed25519), que não é de ninguém.

## 9. Limites da v1

1. Não há assinatura, encadeamento nem carimbo de tempo: isso é a Fase 3. O
   autor só tem a escrita conferida.
2. `estado` e `dominio` não se conferem; a mudança de estado por contestação é
   da Fase 4.
3. A prova pede o Carcara.
4. Os arquivos vão por caminho e SHA-256; na rede, iriam pelo hash.
5. A forma canônica não reconhece paráfrases além dos nomes das variáveis
   ligadas: `P(a) ∧ Q(a)` e `Q(a) ∧ P(a)` têm formas diferentes.
6. O certificado mostra que há um modelo; não diz que ele é o menor.
7. Não há limite de tempo nem de memória no formato: uma conferência que
   esgota o seu dá pendente.
