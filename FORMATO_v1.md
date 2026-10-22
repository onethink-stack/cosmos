# FORMATO_v1 — congelamento documental

Base selada: `502426c0e6f7b96851f0c5e2bff65e3199db24f4`.
Referência pública do verificador: `17a016817c539658d4a92c01d8cb5284333ff115`.

Corrigido de 9 para 13 campos conforme spec pública 502426c

Status solicitado para esta entrega documental: **F2 85%**. Esse percentual
é um marco de planejamento, não uma medida calculada de cobertura de testes.

**Corpus real PT (100 perguntas humanas) PENDENTE - não gerar sintético**

Este documento não gera perguntas, não altera o formato, não modifica o
verificador nem os certificados e não implementa a Fase 4. Os exemplos abaixo
já pertencem à base selada; não constituem corpus novo.

## Fontes normativas congeladas

`FORMATO.md`, `SPEC.md` e `formato/` não existem nesta base. A fonte dos campos
é `especificacao/registros-v1.md`, seção 2. Os nomes e conteúdos dessa seção
são reproduzidos literalmente a seguir. As referências a fases dentro das
transcrições mantêm a redação histórica das fontes; não autorizam trabalho novo.

- [registro-v1 integral](https://github.com/onethink-stack/cosmos/blob/502426c0e6f7b96851f0c5e2bff65e3199db24f4/especificacao/registros-v1.md): as demais seções continuam normativas, inclusive hashes, compromisso, certificado, vínculo 5.1 e recusas.
- [modelo-exato-t1-v1 integral](https://github.com/onethink-stack/cosmos/blob/502426c0e6f7b96851f0c5e2bff65e3199db24f4/especificacao/modelos-exatos-t1.md): versão congelada nesta base; introdução histórica no commit `8ae9e943170e1edea461e4a62cc20561abbf2e4e`.
- [certificados publicados](https://github.com/onethink-stack/cosmos/blob/502426c0e6f7b96851f0c5e2bff65e3199db24f4/especificacao/provas-t1/certificados.json): origem de Z35 e Z39.

SHA-256 dos bytes dos objetos Git, sem conversão de fim de linha:

- `especificacao/registros-v1.md`: `ca61687eddbedd5b158a0c77768522abcbb3abaa93b2352110076ff26b47007a`
- `especificacao/modelos-exatos-t1.md`: `fc17eac43eb8f2b95df186879545f55480aac0e367e9bbc2976c3a03d4b8e56b`
- `especificacao/provas-t1/certificados.json`: `c9daee4d98c490252b5452148e842a3d01830257df06c2694d29ceae4f6e2789`

## Os 13 campos — seção 2 transcrita literalmente


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


---

## Especificação do modelo exato — transcrição integral

# Modelos exatos — formato modelo-exato-t1-v1

Este arquivo define o certificado de um `sat` com números: um modelo que se
confere sem busca e sem ponto flutuante. Ele vale junto com `traducao-z3-t1.md`
(a semântica, seção 2) e com `gramatica-m2.md` (a árvore expandida). Os `sat`
sem números continuam com o modelo finito do lote cego Z3 2
(`provas-t1/certificados.json`, campo `modelo` sem `formato`).

Com números, o modelo não é finito: uma função de argumento real tem infinitos
argumentos, e √2 não se escreve com decimais. Por isso o certificado dá cada
função por casos, com um valor padrão, e os números como racionais ou como
elementos de um corpo Q(α).

## 1. O certificado

Um objeto JSON com estes campos, e só estes (um campo desconhecido é recusado):

| Campo | Conteúdo |
| --- | --- |
| `formato` | `"modelo-exato-t1-v1"` |
| `objetos` | lista não vazia de nomes distintos |
| `mundos` | lista não vazia de nomes distintos |
| `mundoReal` | um dos mundos |
| `algebrico` | opcional: o número α (seção 2) |
| `constantesObjeto` | nome → objeto, para cada constante fora de N livre nas fórmulas (inclusive o nome de um índice que nenhum quantificador prende), e `"∅"` quando ∅ aparece |
| `constantesReais` | nome → número, para cada constante de N |
| `funcoesObjeto` | `"nome/aridade"` → casos por mundo (seção 3), para cada função fora de N |
| `funcoesReais` | `"nome/aridade"` → casos rígidos (seção 3), para cada função de N |
| `predicados` | `"nome/aridade"` → casos por mundo, com valores `true` e `false` |
| `pertence` | lista de trios `[mundo, x, y]`: x ∈ y naquele mundo; os outros são falsos |
| `acessos` | titular → lista de pares `[w, v]` da relação, para cada titular de B[·] |
| `divZero` | D0, a divisão por zero (seção 3); obrigatório quando alguma fórmula tem `/` |
| `testemunhas` | lista: uma testemunha para cada ∃ sobre ℝ ou ℤ de polaridade positiva (seção 4); `[]` se não há |

Os símbolos que as fórmulas não usam são ignorados.

## 2. Números

Um número é escrito de um destes jeitos:

- um racional: `-?d+`, `-?d+/d+` (denominador maior que zero) ou `-?d+.d+`, como
  `"2"`, `"-3/2"`, `"0.5"`;
- `"alpha"`, o número α;
- `{"coeficientes": [a₀, a₁, …]}`, o número a₀ + a₁·α + a₂·α² + …, com cada aᵢ
  um racional escrito; sem `algebrico`, só com um coeficiente.

O campo `algebrico` define α:

- `polinomio`: os coeficientes inteiros, em grau crescente (`[-2, 0, 1]` é
  x² − 2), inteiros do JSON de módulo até 2⁵³ − 1, grau 1 ou mais, coeficiente
  líder positivo, primitivo (mdc 1) e **irredutível** sobre Q;
- `intervaloAberto`: dois racionais escritos `[a, b]`, com a < b, p(a) ≠ 0,
  p(b) ≠ 0 e **exatamente uma** raiz real de p em (a, b), contada pela sequência
  de Sturm. α é essa raiz;
- `indiceDaRaiz`: opcional; se vier, tem de ser 1 mais o número de raízes reais
  de p menores que a (1 é a menor, como no `root-obj` do Z3).

Com p irredutível, Q(α) = Q[x]/(p) é um corpo: as contas são as de polinômios
módulo p, um número é zero só se o polinômio reduzido é zero, e o sinal se
decide cortando o intervalo de α ao meio até o número não ter raiz nele.

## 3. Funções, predicados e D0

**Casos por mundo** (funções de objeto e predicados, que mudam com o mundo):
`{"padrao": v, "porMundo": {mundo: v}, "excecoes": [{"mundo": w, "argumentos":
[…], "valor": v}]}`, com `porMundo` e `excecoes` opcionais. O valor em (w,
argumentos) é o da exceção com esse mundo e esses argumentos; se não há, o de
`porMundo[w]`; se não há, o padrão. Toda exceção diz o mundo.

**Casos rígidos** (funções de N, que não mudam com o mundo): `{"padrao": v,
"excecoes": [{"argumentos": […], "valor": v}]}`; nenhuma exceção diz mundo.

Cada argumento é o nome de um objeto ou um número, conforme a sorte do argumento
nas fórmulas. Duas exceções com o mesmo mundo e argumentos iguais são recusadas;
números são comparados como números (`"2"` e `"4/2"` são iguais).

**D0**: `{"padrao": v, "excecoes": [{"numerador": n, "valor": v}]}`. Pela seção
2 de `traducao-z3-t1.md`, dividir por zero dá um número que só depende do
numerador: x / 0 = D0(x). Dois numeradores iguais são recusados.

## 4. Testemunhas e polaridade

A polaridade de uma subfórmula é positiva no topo; ¬ e o lado esquerdo de ⟹ a
invertem; dentro de ⟺ ela é as duas; ∧, ∨, o lado direito de ⟹, □, ◇, B[·] e os
quantificadores a mantêm.

- Um **∃x∈ℝ** ou **∃x∈ℤ** só é aceito em polaridade positiva, e leva uma
  testemunha: `{"formula": i, "variavel": "x", "valor": número}`, com `i` o
  índice da fórmula a partir de 0. Entre esses ∃, cada fórmula tem cada nome de
  variável uma vez só. Num ∃x∈ℤ, o valor é inteiro.
- Um **∀ sobre ℝ ou ℤ** é recusado, e também um ∃ sobre ℝ ou ℤ em polaridade
  negativa ou dentro de ⟺.
- A forma da fórmula decide, antes de avaliar: um ∀ sobre ℝ num ramo que a
  avaliação não visitaria também é recusado. Assim a resposta não depende da
  ordem da avaliação.
- A lista de testemunhas tem exatamente uma para cada ∃ aceito: nem mais, nem
  menos.

Por que só a positiva: trocar ∃x φ por φ(t) dá uma fórmula que implica a
original, e numa posição positiva isso basta (se o todo vale com φ(t), vale com
∃x φ). Debaixo de ¬, o ∃ vira um ∀, e um ∀ sobre ℝ não se confere com um ponto
só: ¬∃x∈ℝ x = 1, com a testemunha x = 0, daria verdadeiro, e a fórmula é falsa
em todo modelo. Uma testemunha só, debaixo de ∀ sobre objetos, □ ou B[·],
continua correta; só deixa de fora os modelos que precisariam de uma testemunha
por objeto ou por mundo.

## 5. A conferência

O certificado é aceito quando a forma está certa (seções 1 a 4), o quadro de
cada titular é KD45 (serial, transitivo e euclidiano, em todos os mundos),
nenhum trio de `pertence` tem como y o objeto de ∅, e cada fórmula, na árvore
expandida, vale no mundo real pela semântica t1:

| Na árvore | Valor |
| --- | --- |
| `t = u` | o mesmo objeto, ou o mesmo número; entre um objeto e um número, recusa |
| `t ∈ u` | o trio está em `pertence` (entre objetos) |
| `<`, `≤`, `>`, `≥` | a comparação dos números, exata |
| `t / u` | t · u⁻¹ se u ≠ 0; D0(t) se u = 0 |
| `t ^ k` | só com k um natural escrito de 0 a 12: t multiplicado k vezes (1 se k = 0); a outra potência é recusada |
| □, ◇ | todos os mundos, algum mundo |
| B[a] φ | φ em todo v com `[w, v]` nos acessos de a |
| ∀x φ, ∃x φ | todos os objetos, algum objeto |
| ∃x∈ℝ φ, ∃x∈ℤ φ | φ com x valendo a testemunha |

∅ é um objeto (o de `constantesObjeto["∅"]`): ∀x (x ≠ ∅) é falsa, porque x pode
ser ∅. Não há busca nenhuma.

## 6. Limites da v1

1. Um α só por certificado. Um modelo com √2 e √3 precisaria de um elemento
   primitivo, ou de outra versão.
2. ∀ sobre ℝ ou ℤ não se certifica: pede uma prova simbólica, não um modelo.
3. Uma testemunha constante por ∃; uma testemunha que muda com o objeto ou com
   o mundo fica para outra versão.
4. Só a potência de expoente natural escrito, a que a tradução t1 faz por
   multiplicação.
5. A conferência do Caderno decide a irredutibilidade até o grau 3 (no grau 3,
   procurando raiz racional, com coeficientes de módulo até 10⁶) e recusa acima
   disso. Outra conferência pode ir além; a regra do formato é a mesma.
6. O certificado mostra que há um modelo; não diz que ele é o menor.

## 7. Onde estão

Os cinco `sat` com números dos exemplos normativos (Z07, Z08, Z33, Z35 e Z39)
têm o modelo exato em `provas-t1/certificados.json`, a partir da versão c3. O
Caderno o tira do modelo do Z3 (`src/motor/z3Modelo.ts`): antes da consulta,
cada ∃ sobre ℝ ou ℤ de polaridade positiva vira uma constante nova, e o modelo
do Z3 dá as funções por casos; o `root-obj` vira o polinômio e um intervalo
isolante, e o próprio Z3 confere que o seu valor está no intervalo. A
conferência do Caderno (`src/motor/modeloExato.ts`) é testada em
`testes/modelos-exatos.test.ts`, com os contraexemplos da seção 4 e da rodada
31.

Na rodada 31, os modelos foram cruzados com a implementação independente do
GPT (o avaliador numérico da rodada 30, escrito só por esta especificação no
formato experimental que a antecedeu): ela aceitou os cinco do Caderno, e a
conferência do Caderno aceitou os cinco dela. Nela foram achados dois defeitos
de correção (a testemunha usada em qualquer polaridade, e ∅ fora do domínio de
objetos), que este formato recusa, e uma fragilidade (`assert` que `python -O`
tira). Consertada, no pacote da Fase 2, ela está no verificador público
(`provas-t1/independente/avaliador_kripke_numerico_v1.py`): aceita os cinco e
recusa os estragos deles.

---

## Exemplos exatos já publicados, sem modificar valores

Os blocos abaixo reproduzem os campos `id`, `formulas`, `fichas` e `modelo`
dos certificados indicados, preservando seus valores. São excertos do pacote
de certificados, não registros-v1 completos de 13 campos.

### Z35 — testemunha em ℚ(√2)

O certificado publicado isola α = −√2 no intervalo (−3/2, −1), com
polinômio x² − 2 e índice de raiz 1. Portanto ℚ(α) = ℚ(√2).
A testemunha `alpha` satisfaz x · x = 2 exatamente; não foi substituída
pela raiz positiva nem por aproximação decimal.

```json
{
  "id": "Z35",
  "formulas": [
    "∃x∈ℝ x · x = 2"
  ],
  "fichas": [],
  "modelo": {
    "formato": "modelo-exato-t1-v1",
    "objetos": [
      "o0"
    ],
    "mundos": [
      "w0"
    ],
    "mundoReal": "w0",
    "algebrico": {
      "polinomio": [
        -2,
        0,
        1
      ],
      "intervaloAberto": [
        "-3/2",
        "-1"
      ],
      "indiceDaRaiz": 1
    },
    "constantesObjeto": {},
    "constantesReais": {},
    "funcoesObjeto": {},
    "funcoesReais": {},
    "predicados": {},
    "pertence": [],
    "acessos": {},
    "testemunhas": [
      {
        "formula": 0,
        "variavel": "x",
        "valor": "alpha"
      }
    ]
  }
}
```

### Z39 — D0(x)=5

O certificado publicado dá `divZero` com `padrao` igual a `"5"`, sem
exceções: D0(x)=5 para todo numerador. A fórmula original é `n / 0 = 5`,
com `n` igual a `"7719"`. Isso é a interpretação de divisão por zero da
semântica t1, não uma afirmação de que a divisão usual dos reais define x/0.

Z35 e Z39 são exemplos separados da fonte; não foram fundidos em um novo
certificado. O tratamento de ∅ e as restrições de polaridade estão na
especificação integral acima.

```json
{
  "id": "Z39",
  "formulas": [
    "n / 0 = 5"
  ],
  "fichas": [
    {
      "simbolo": "n",
      "tipo": "constante",
      "aridade": 0,
      "numerico": true
    },
    {
      "simbolo": "m",
      "tipo": "constante",
      "aridade": 0,
      "numerico": true
    },
    {
      "simbolo": "f",
      "tipo": "funcao",
      "aridade": 1,
      "numerico": true
    },
    {
      "simbolo": "g",
      "tipo": "funcao",
      "aridade": 2,
      "argumentos": [
        "num",
        "obj"
      ]
    },
    {
      "simbolo": "Q",
      "tipo": "predicado",
      "aridade": 1,
      "argumentos": [
        "num"
      ]
    }
  ],
  "modelo": {
    "formato": "modelo-exato-t1-v1",
    "objetos": [
      "o0"
    ],
    "mundos": [
      "w0"
    ],
    "mundoReal": "w0",
    "constantesObjeto": {},
    "constantesReais": {
      "n": "7719"
    },
    "funcoesObjeto": {},
    "funcoesReais": {},
    "predicados": {},
    "pertence": [],
    "acessos": {},
    "divZero": {
      "padrao": "5"
    },
    "testemunhas": []
  }
}
```

## Pendência de corpus e limites desta entrega

Corpus real PT (100 perguntas humanas) PENDENTE - não gerar sintético

Nenhuma pergunta humana foi coletada ou criada nesta entrega. Os casos
normativos existentes não contam como as 100 perguntas humanas pendentes.
Este congelamento é documental; não é declaração de conclusão desse corpus,
de execução nova de CI ou de implementação de Carcara, OpenTimestamps ou GPU.
