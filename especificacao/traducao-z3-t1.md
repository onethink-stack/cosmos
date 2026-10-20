# Tradução para o Z3 — versão t1

Este arquivo define como o Caderno Lógico leva as fórmulas ao Z3 e o que a
resposta do Z3 quer dizer. Ele vale junto com `gramatica-m2.md`, de onde vem a
árvore expandida (seção 5), e com `traducao-z3-t1-exemplos.json`, os exemplos
normativos. Com os três, outra implementação pode traduzir as mesmas fórmulas
sem ler o código do Caderno e conferir se a semântica é preservada.

## 1. O que entra e o que sai

Entra uma lista de fórmulas aceitas e já expandidas, e o conjunto **N** dos
nomes numéricos: os símbolos das fichas que dizem `numerico` (constantes e
funções cujo valor é número).

Sai o veredito do Z3 para a conjunção das fórmulas, todas afirmadas no mundo
real:

| Veredito | Quer dizer |
| --- | --- |
| `unsat` | Não há modelo de tamanho nenhum, nem infinito |
| `sat` | Há modelo, que pode ser maior que qualquer limite ou infinito |
| `unknown` | O Z3 não decidiu no prazo (20 s no Caderno) |

As perguntas do Caderno são conjunções. "Segue" é: as premissas e a negação da
conclusão não têm modelo. "Contradiz" é: as premissas e a conclusão não têm
modelo. "Consistente" é: as premissas têm modelo. Antes de perguntar, o Caderno
pode deixar de fora as premissas que não têm nenhum nome em comum com a
conclusão, nem por meio de outras premissas; isso escolhe o que vai ao Z3, e
não muda a tradução.

## 2. Semântica

As fórmulas falam de estruturas de Kripke com domínio constante:

- um conjunto não vazio **O** de objetos e um conjunto não vazio **W** de
  mundos, com um mundo real **w₀**;
- cada constante fora de N é um objeto, o mesmo em todos os mundos (rígida);
- cada constante de N é um número real, rígida;
- cada função fora de N dá, em cada mundo, um objeto para cada lista de
  argumentos (pode mudar de um mundo para outro);
- cada função de N dá um número real e é a mesma em todos os mundos;
- cada predicado (e cada proposição, o predicado de aridade 0) é, em cada mundo,
  um conjunto de listas de argumentos;
- a pertinência (∈) é, em cada mundo, uma relação entre objetos;
- cada titular `a` de B[a] tem uma relação de acesso **Rₐ** entre mundos, serial,
  transitiva e euclidiana (KD45);
- ∅ é um objeto ao qual nenhum objeto pertence, em mundo nenhum.

O valor de uma fórmula num mundo `w`:

| Fórmula | Vale em `w` quando |
| --- | --- |
| `t = u` | os dois termos são o mesmo objeto, ou o mesmo número |
| `t ∈ u` | o par está na pertinência de `w` |
| `t < u`, `≤`, `>`, `≥` | a comparação vale nos reais |
| `P(t…)` | a lista está no predicado em `w` |
| ¬, ∧, ∨, ⟹, ⟺ | como na lógica clássica |
| `□φ` | φ vale em **todos** os mundos (S5: não há relação de acesso para □) |
| `◇φ` | φ vale em algum mundo |
| `B[a] φ` | φ vale em todo `v` com Rₐ(w, v) |
| `∀x φ`, `∃x φ` | para todo / algum objeto, o mesmo domínio em todos os mundos |
| `∀x∈ℝ φ`, `∃x∈ℝ φ` | para todo / algum número real |
| `∀x∈ℤ φ`, `∃x∈ℤ φ` | para todo / algum número inteiro |

As contas são as dos reais. Dividir por zero dá algum número, que só depende do
numerador (`n / 0 = 5` tem modelo; com `n = m`, `n / 0` e `m / 0` são o mesmo
número). A potência com expoente natural escrito como número é multiplicação
repetida; as outras seguem a potência real do Z3.

As fórmulas valem em w₀. O motor finito do Caderno usa a mesma semântica, com O
e W finitos, e não lê números: as fórmulas com números só vão ao Z3.

## 3. Tradução

Tipos do Z3: `Obj` e `Mundo` (não interpretados), `Bool` e `Real`. Há uma
constante `w0 : Mundo` e uma função `pertence : Mundo × Obj × Obj → Bool`.

**Símbolos.** Os nomes no Z3 são informativos; o que conta é o tipo de cada
símbolo e se ele recebe o mundo.

| Na árvore | No Z3 |
| --- | --- |
| constante `c`, fora de N | `c:c : Obj` |
| constante `n`, em N | `n:n : Real` |
| `∅` | `c:∅ : Obj`, mais o axioma ∀w ∀z ¬pertence(w, z, c:∅) |
| número | `Real` com o valor decimal escrito |
| `f(t₁…tₖ)`, f fora de N | `f:f/k[:sig](w, t₁…tₖ) : Obj` |
| `f(t₁…tₖ)`, f em N | `fn:f/k[:sig](t₁…tₖ) : Real`, sem o mundo |
| `P(t₁…tₖ)`; proposição `A` | `p:P/k[:sig](w, t₁…tₖ) : Bool`; `p:A/0(w)` |
| titular `a` | `R:a : Mundo × Mundo → Bool` |

`[:sig]` aparece quando os argumentos misturam números e objetos: dois pontos e
uma letra por argumento, R para número e O para objeto. Assinaturas diferentes
são símbolos diferentes; o validador garante que um nome é usado sempre do
mesmo jeito.

**Fórmulas.** T(φ, w) traduz φ no mundo `w`:

| φ | T(φ, w) |
| --- | --- |
| ⊤, ⊥ | verdadeiro, falso |
| `t = u` | τ(t) = τ(u) |
| `t ∈ u` | pertence(w, τ(t), τ(u)) |
| `t < u`, `≤`, `>`, `≥` | a comparação do Z3 nos reais |
| `P(t₁…tₖ)` | `p:P/k[:sig](w, τ(t₁)…τ(tₖ))` |
| ¬φ, φ ∧ ψ, φ ∨ ψ, φ ⟹ ψ | os do Z3 |
| φ ⟺ ψ | T(φ, w) = T(ψ, w) |
| □φ | ∀v:Mundo. T(φ, v) |
| ◇φ | ∃v:Mundo. T(φ, v) |
| B[a] φ | ∀v:Mundo. R:a(w, v) ⟹ T(φ, v) |
| ∀x φ, ∃x φ | ∀x:Obj, ∃x:Obj |
| ∀x∈ℝ φ, ∃x∈ℝ φ | ∀x:Real, ∃x:Real |
| ∀x∈ℤ φ | ∀x:Real. éInteiro(x) ⟹ T(φ, w) |
| ∃x∈ℤ φ | ∃x:Real. éInteiro(x) ∧ T(φ, w) |

A árvore expandida não tem ≠, ∉, ⊆, ⋂, ⋃ nem ∀x∈S: a expansão já os trocou
(`gramatica-m2.md`, seção 5).

**Termos.** τ(t) traduz um termo:

| t | τ(t) |
| --- | --- |
| variável ligada | a variável do quantificador |
| `−t` | −τ(t) |
| `t + u`, `t − u`, `t · u`, `t / u` | +, −, ·, / dos reais |
| `t ^ k`, com `k` um número natural escrito, de 0 a 12 | 1 se k = 0; senão, τ(t) multiplicado k vezes |
| `t ^ u`, nos outros casos | a potência real do Z3 |

**Asserções.** Cada fórmula φ da lista entra como T(φ, w0). Entram também o
axioma do ∅, se o ∅ aparece, e, para cada titular `a` que aparece:

- serial: ∀p ∃q R:a(p, q);
- transitiva: ∀p ∀q ∀r (R:a(p, q) ∧ R:a(q, r) ⟹ R:a(p, r));
- euclidiana: ∀p ∀q ∀r (R:a(p, q) ∧ R:a(p, r) ⟹ R:a(q, r)).

## 4. Limitações conhecidas da t1

1. **Número só pela ficha.** Um nome livre sem ficha, usado onde se pede número,
   não está em N. Ele é traduzido como `Obj`, e a tradução falha: dá erro, não
   veredito. O validador não recusa esses casos porque a sorte do nome é
   desconhecida (`gramatica-m2.md`, seção 4.3). Uma versão t2 poderia tirar a
   sorte do uso.
2. **Crença com modelo.** Com os axiomas do KD45, o Z3 às vezes não decide um
   problema que tem modelo: dá `unknown` em 20 s. Dois exemplos mostram isso
   ("titulares independentes" e "crença e possibilidade"). Escrever o axioma
   serial com uma função de escolha (∀p R(p, s(p))) não resolveu. O motor finito
   acha esses modelos, com 1 objeto e 2 mundos. Quando o Z3 decide `unsat`, a
   resposta vale para qualquer tamanho.
3. **Contas.** A divisão por zero e a potência seguem as convenções do Z3.

## 5. Exemplos normativos

`traducao-z3-t1-exemplos.json` tem, para cada exemplo, as fórmulas, as fichas, a
regra que ele isola, o veredito do Z3 no Caderno e, nos que não usam números, o
resultado do motor finito (até 8 objetos e 3 mundos). Os dois motores
concordam em todos os exemplos: onde o Z3 diz `unsat`, o motor finito não acha
modelo; onde há modelo finito, o Z3 não diz `unsat`.

## 6. Ambiente do Caderno

O Caderno roda o **Z3 5.1.0.0**, em WebAssembly, pelo pacote `z3-solver` 5.2.0,
com um contexto novo a cada checagem e prazo de 20 s. Os nomes das variáveis
novas são contados a partir de zero em cada checagem, então a mesma lista de
fórmulas chega ao Z3 sempre com o mesmo texto, e a resposta não depende do que
rodou antes. A versão está registrada em
`traducao-z3-t1-exemplos.json` (campo `z3`), e o teste da tradução falha se ela
mudar, para que uma troca de versão nunca passe em silêncio. Um `unknown` pode
mudar com a versão do Z3, a plataforma e o prazo. Um veredito decidido não deve
mudar. A auditoria independente de 19/10/2026, com o Z3 4.13.3 nativo,
reproduziu os 42 vereditos.

## 7. Conformidade

Uma tradução independente está conforme os exemplos quando:

1. em todo exemplo em que o Z3 do Caderno decidiu, ela não decide o contrário (um
   `unknown` dela não é divergência, mas é registrado);
2. nos exemplos em que o Z3 do Caderno deu `unknown`, um `sat` dela está certo, e
   um `unsat` é falha (há modelo finito).

A conferência mais forte da preservação da semântica é avaliar as fórmulas em
estruturas finitas por outro caminho (como faz o motor finito) e cruzar com o
veredito do Z3: um `unsat` nunca pode ter modelo finito.

A versão é **t1**. Uma mudança no que uma fórmula quer dizer para o Z3 (ou na
versão do Z3) muda a versão, e as respostas guardadas da versão anterior deixam
de valer: a chave delas começa com `h2:t1|`.

## 8. Auditoria independente

Uma segunda implementação, escrita a partir deste arquivo e de `gramatica-m2.md`,
com o Z3 4.13.3 nativo, foi comparada com o Caderno em 19/10/2026. Em cada lote
cego, um lado recebeu só as entradas, os dois guardaram as respostas com SHA-256
antes de ver as do outro, e a comparação foi feita caso a caso.

| Conjunto | Casos | Vereditos opostos (sat × unsat) | Diferenças | Motor finito |
| --- | --- | --- | --- | --- |
| exemplos normativos | 42 | 0 | nenhuma | igual nos 27 sem números |
| lote cego Z3 1 | 300 | 0 | 7, todas de `unknown` | igual nos 68 sem números |
| lote cego Z3 2 | 300 | 0 | 8, todas de `unknown` | igual nos 195 sem números |

O lote 2 cobriu funções e nomes com índice em 2 e 3 mundos, crença KD45, índices
presos por quantificador, funções numéricas de argumento não rígido e variáveis
escondidas (E5). Nele, os modelos finitos foram trocados como certificados: os 90
de cada lado passaram na conferência do outro, sem busca (forma, quadro KD45 de
cada titular e cada fórmula no mundo real).

A auditoria diferencial da t1 está encerrada. Ela não prova que as duas traduções
concordam em tudo; mostra que, nesses 642 casos, nenhuma decidiu o contrário da
outra. Um `unsat` ainda é a palavra do Z3: o próximo passo é a prova verificável
(Alethe, conferida por outro programa), presa à fórmula, à árvore expandida, à
versão t1 e ao problema enviado ao solucionador. As primeiras estão em
`provas-t1/`: 28 dos 30 exemplos unsat têm prova; Z36 e Z40 ficam fora do
formato.
