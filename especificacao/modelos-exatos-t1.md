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
