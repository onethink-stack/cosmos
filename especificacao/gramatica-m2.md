# Gramática das fórmulas do Caderno Lógico — versão semântica m2

Este arquivo define como um texto vira árvore no Caderno Lógico. Ele vale junto
com três arquivos de dados, nesta mesma pasta:

- `lexico-m2.json`: os símbolos, todas as grafias aceitas e as regras de nome,
  índice e número.
- `diagnosticos-m2.json`: os códigos E0 a E17, a condição de cada um e a ordem
  em que são escolhidos.
- `exemplos-m2.json`: os exemplos normativos, cada um com a árvore esperada, a
  árvore expandida e os diagnósticos.

Versões: semântica **m2**; tradução para o Z3 **t1**. Uma mudança de sentido só
entra com uma versão nova; nenhuma nota e nenhum certificado mudam de sentido
em silêncio.

## 1. Léxico

O texto é dividido em símbolos antes da análise. Em cada posição, o leitor
tenta nesta ordem:

1. Espaço em branco: separa símbolos. O leitor anota se havia espaço antes de
   cada símbolo, porque isso decide a aplicação, a crença e o índice (seção 1.4).
2. Subscritos Unicode: uma sequência deles vira um índice.
3. `_` seguido de caracteres de nome ou apóstrofo: índice. `_` sozinho é E8.
4. Dígitos 0 a 9: número, com parte decimal opcional (`2`, `0.5`).
5. `ℝ` e `ℤ`.
6. Caractere de nome: começa um nome (seção 1.1).
7. Símbolos de `lexico-m2.json`, na ordem dada. A grafia mais longa vem antes de
   quem é prefixo dela: `<=>` é ⟺, não ≤ seguido de >.
8. Qualquer outra coisa: E8. Depois de `\`, o comando inteiro (letras A–Z, a–z)
   vira um só E8.

### 1.1 Nomes

Um nome começa por um caractere das classes Unicode L ou N, menos os subscritos
e menos os dígitos 0 a 9, que começam números. Continua com caracteres das
classes L ou N (menos subscritos) e com apóstrofo.

- `x`, `x'`, `Ω`, `αβ`, `²x`, `٣x` e `xᵃ` são nomes.
- Maiúsculas e minúsculas são nomes diferentes.
- Não há normalização Unicode: um nome em NFD é recusado (E8 em cada marca
  combinante).
- Sobrescritos são caracteres de nome. Os doze `⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁿ ⁱ` dão o
  aviso E17, porque parecem expoente; `x²` continua sendo um nome, não x ao
  quadrado. `⁺ ⁻ ⁼ ⁽ ⁾` não são caracteres de nome (E8).

### 1.2 Índices

Os subscritos de `lexico-m2.json`, ou `_` seguido de letras e dígitos, colados
ao nome, formam um índice: `xᵢ` é o mesmo que `x_i`, e os dois viram
`(_ x i)`. Subscritos nunca fazem parte de um nome.

### 1.3 Números

`[0-9]+(\.[0-9]+)?`. Número colado a nome não é multiplicação: `2x = 4` é E2.

### 1.4 Adjacências

- Aplicação: `(` colado ao nome, sem espaço. `P(a)` é aplicação; `P (a)` não é.
- Crença: `B` colado ao `[`. Com espaço, `B` é um nome comum.
- Índice: colado ao nome.

## 2. Sintaxe

A leitura normativa é a desta PEG (gramática de expressões de análise),
aplicada aos símbolos do léxico:

```peg
Formula       <- Equivalencia
Equivalencia  <- Implicacao ("⟺" Implicacao)*
Implicacao    <- Disjuncao ("⟹" Implicacao)?
Disjuncao     <- Conjuncao ("∨" Conjuncao)*
Conjuncao     <- Unaria ("∧" Unaria)*
Unaria        <- "¬" Unaria
               / "□" Unaria
               / "◇" Unaria
               / Crenca
               / Quantificador
               / Termo Relacao Termo
               / "(" Formula ")"
               / Aplicacao
               / Proposicao
Crenca        <- "B" "[" Nome+ "]" Unaria
Quantificador <- ("∀" / "∃") Variavel ("∈" (Termo / "ℝ" / "ℤ"))? Formula
Relacao       <- "=" / "≠" / "∈" / "∉" / "⊆" / "<" / "≤" / ">" / "≥"

Termo         <- Produto (("+" / "−") Produto)*
Produto       <- Sinal (("·" / "/") Sinal)*
Sinal         <- "−" Sinal / Potencia
Potencia      <- Uniao ("^" Sinal)?
Uniao         <- Intersecao ("⋃" Intersecao)*
Intersecao    <- Primario ("⋂" Primario)*
Primario      <- "∅" / Numero / Aplicacao / Indexado / Nome / "(" Termo ")"
Aplicacao     <- Nome "(" Termo ("," Termo)* ")"
Indexado      <- Nome Indice
Proposicao    <- Nome
Variavel      <- Nome
```

### 2.1 Como a PEG é lida

- **Escolha ordenada.** Em `/`, as alternativas são tentadas na ordem escrita, e
  fica a primeira que der certo.
- **Repetição gulosa.** `*` e `?` consomem o máximo que puderem e não devolvem.
- **Decisão pelo primeiro símbolo.** Em quase todas as regras, o primeiro
  símbolo já decide a alternativa. Só há uma volta atrás: um `(` em posição de
  fórmula. Ali o leitor tenta primeiro `Termo Relacao Termo`, como em
  `(A ⋃ B) ⊆ C`. Se a tentativa der erro de sintaxe ou não chegar a uma relação,
  ele volta ao `(` e lê `"(" Formula ")"`. O erro da tentativa é descartado; um
  erro de limite (seção 7) não é.
- **Átomo começando por nome.** O leitor lê um termo. Se vier uma relação, é
  relação. Se o termo for aplicação sem índice, é predicado. Se for um nome
  sozinho que o dicionário diz ser predicado de aridade 0, é proposição. Senão,
  E2.
- **Entrada inteira.** Uma fórmula só é aceita se a leitura consumir todos os
  símbolos. Se sobrar algo que começa uma fórmula, E3; senão, E0.
- **O `)` de cada grupo.** O balanceamento é conferido antes da sintaxe (E7).
  `"(" Formula ")"` e `"(" Termo ")"` consomem o `)` que casa com o seu `(`.

### 2.2 Escopo do quantificador

O corpo do quantificador é lido pela regra `Formula`, a de menor precedência.

1. Ao achar ∀ ou ∃ numa posição de prefixo, o leitor lê a variável e, se houver,
   `∈` e o domínio.
2. O corpo consome símbolos até o fim do texto ou até o `)` que fecha o grupo em
   que o quantificador está.
3. Só depois disso os laços de ∧, ∨, ⟹ e ⟺ do nível de fora voltam a olhar o
   texto, e não sobra nada para eles.

| Entrada | Árvore |
| --- | --- |
| `∀x P(x) ⟹ Q(b)` | `(∀ x (⟹ (P x) (Q b)))` |
| `(∀x P(x)) ⟹ Q(b)` | `(⟹ (∀ x (P x)) (Q b))` |
| `P(a) ∧ ∀x P(x) ⟹ Q(b)` | `(∧ (P a) (∀ x (⟹ (P x) (Q b))))` |
| `(P(a) ∧ ∀x P(x)) ⟹ Q(b)` | `(⟹ (∧ (P a) (∀ x (P x))) (Q b))` |
| `¬∀x P(x) ∨ Q(b)` | `(¬ (∀ x (∨ (P x) (Q b))))` |
| `∀x ∃y P(x) ⟹ Q(y)` | `(∀ x (∃ y (⟹ (P x) (Q y))))` |
| `∃x ∀y R(x, y) ∧ ∃z P(z) ⟹ Q(x)` | `(∃ x (∀ y (∧ (R x y) (∃ z (⟹ (P z) (Q x))))))` |
| `(∀x P(x) ∧ Q(x)) ∨ ∃y R(y, y) ⟹ P(y)` | `(∨ (∀ x (∧ (P x) (Q x))) (∃ y (⟹ (R y y) (P y))))` |
| `B[Ana] ∀x P(x) ∧ Q(x)` | `(B "Ana" (∀ x (∧ (P x) (Q x))))` |

Com quantificadores aninhados, a regra vale para cada um. Os que estão no mesmo
grupo terminam todos no mesmo ponto; um quantificador dentro de um grupo próprio
termina no `)` desse grupo. Um conectivo à direita de um quantificador fica com
ele, mesmo prendendo menos que o conectivo de fora: em
`(∀x P(x) ∧ Q(x)) ∨ ∃y R(y, y) ⟹ P(y)`, o ⟹ é do ∃y. Isso se confere só pelo
texto: os predicados e relações do corpo de um quantificador são exatamente os
que estão entre o ∀ ou ∃ e o `)` que fecha o grupo em volta dele, ou o fim do
texto, quando não há grupo.

### 2.3 Precedência e associação

Da que prende mais à que prende menos:

| Nível | Operadores | Associação |
| --- | --- | --- |
| Termos | ⋂ | à esquerda |
| Termos | ⋃ | à esquerda |
| Termos | ^ | à direita: `2^3^2` = `2^(3^2)` |
| Termos | − unário | prefixo: `−x^2` = `−(x^2)` |
| Termos | · / | à esquerda |
| Termos | + − | à esquerda |
| Relações | = ≠ ∈ ∉ ⊆ < ≤ > ≥ | não encadeiam: `a = b = c` é E0 |
| Fórmulas | ¬ □ ◇ B[…] | prefixos: prendem só o que vem logo depois |
| Fórmulas | ∧ | à esquerda |
| Fórmulas | ∨ | à esquerda |
| Fórmulas | ⟹ | à direita: `A ⟹ B ⟹ C` = `A ⟹ (B ⟹ C)` |
| Fórmulas | ⟺ | à esquerda |
| Fórmulas | ∀ ∃ | prefixo cujo corpo vai até o fim (2.2) |

## 3. Etapas e escolha dos diagnósticos

A leitura tem três etapas. A ordem exata em que os diagnósticos são escolhidos
está em `diagnosticos-m2.json`, campo `selecao`.

1. **Léxico e sintaxe**: texto em símbolos, símbolos em árvore. Consulta o
   dicionário só para a proposição (2.1). Erros: E0, E1, E2, E3, E7, E8.
2. **Nomes e tipos**: confere o uso de cada nome na árvore inteira, com o
   dicionário quando há. Erros: E4, E9, E10, E11, E15, E18. Avisos: E5, E6, E14, E16,
   E17; E12 e E13 só quando as fichas são exigidas.
3. **Avaliação**: motor finito, Z3 e avaliador de cenários. Não emite códigos:
   responde segue, não segue, contradiz ou não decidiu.

Uma árvore pode ser montada e a fórmula ainda ser recusada na etapa 2:
`a ≠ a` (E9) e `(A ⋂ B) = C` (E11). A fórmula é aceita quando não tem nenhum
diagnóstico de nível erro.

### 3.1 Posição e ordem dos diagnósticos

Cada diagnóstico tem um `inicio`: a posição do primeiro caractere a que ele se
refere, contando os caracteres Unicode (pontos de código) do texto como foi
escrito, a partir de 0. Nos exemplos, o `inicio` é normativo em E7, E8 e em
todos os códigos da etapa de nomes e tipos. Nos erros de sintaxe (E0 a E3) ele
é informativo: o código é que tem de bater.

O trecho de um nó da árvore começa: numa relação, num conectivo, em ⋂ ou ⋃ e
nas contas, no operando da esquerda; num prefixo (¬ □ ◇ B[…] e o − de sinal) e
num quantificador, no seu símbolo; numa aplicação ou num nome com índice, no
nome. O próprio índice começa no `_`, ou no primeiro subscrito: em `A_x`, o `x`
do índice começa na posição do `_`. Um termo ou uma fórmula entre parênteses
começa no `(` (no de fora, quando há vários pares em volta).

| Código | `inicio` |
| --- | --- |
| E4, E5 | a variável do quantificador (no E5, a do quantificador de dentro) |
| E6 | o trecho da ocorrência livre; uma por ocorrência |
| E7 | o parêntese escolhido |
| E8 | o primeiro caractere do símbolo desconhecido; num comando, a `\` |
| E9 | o trecho da relação |
| E10 | o trecho da ocorrência que discorda (predicado, aplicação ou nome); num quantificador, a variável |
| E11 | o trecho do termo ⋂ ou ⋃ |
| E12, E13 | o nome na primeira ocorrência, sem os parênteses em volta |
| E14, E16 | o trecho do quantificador |
| E15 | o trecho do termo de sorte errada; ou o da relação, quando os dois lados de = ou ≠ discordam |
| E17 | o nome, sem os parênteses em volta |
| E18 | o trecho da ocorrência no domínio |

No E10, a primeira ocorrência de um nome, na ordem do texto, decide o uso dele;
cada ocorrência seguinte que discorda recebe um E10. Com ficha, cada ocorrência
que discorda da ficha recebe um.

Ordem: pelo `inicio`; no mesmo `inicio`, pelo número do código. Em
`x ≠ x ∧ ∀x P(x)` vêm E6 e E9, ambos no 0, e depois E6 no 4. Dois
diagnósticos com o mesmo código e o mesmo `inicio` não se distinguem no pacote.

## 4. Dicionário

Cada ficha tem `simbolo`, `tipo` (constante, função ou predicado), `aridade`,
`numerico` (constante ou função com valor real) e `argumentos` (lista de `num`
e `obj`, quando a função mistura números e objetos).

Sem ficha, um nome vale pelo uso: aplicado em posição de fórmula é predicado;
aplicado dentro de um termo é função; sozinho num termo é constante. O mesmo
nome usado de dois jeitos incompatíveis dá E10. Por isso um verificador
independente precisa receber, junto com a fórmula, as fichas dos nomes que ela
usa; nos exemplos normativos, elas estão no campo `fichas`.

## 5. Expansão

O motor finito e o Z3 recebem a árvore expandida. A expansão troca:

| Forma | Vira |
| --- | --- |
| `t ⊆ u` | `∀z (z ∈ t ⟹ z ∈ u)` |
| `z ∈ t ⋂ u` | `z ∈ t ∧ z ∈ u` |
| `z ∈ t ⋃ u` | `z ∈ t ∨ z ∈ u` |
| `z ∈ ∅` | falso (`⊥`) |
| `∀x∈S φ` | `∀x (x ∈ S ⟹ φ)` |
| `∃x∈S φ` | `∃x (x ∈ S ∧ φ)` |
| `t ≠ u` | `¬(t = u)` |
| `t ∉ u` | `¬(t ∈ u)` |

**Variável nova do ⊆.** Antes de expandir, junta-se o conjunto U dos nomes da
fórmula: constantes, funções, predicados (inclusive proposições), variáveis de
quantificador e nomes nos domínios. Os titulares de `B[…]` não entram em U:
são outra espécie de nome, que nenhum ∀ prende. Os ⊆ são expandidos na ordem
em que aparecem no texto. Cada um recebe o primeiro nome da sequência `z`, `z1`,
`z2`, … que não está em U, e esse nome entra em U. Por isso dois ⊆ na mesma
fórmula recebem `z` e `z1` (exemplo G088), `z ⊆ z1` recebe `z2` (G093) e
`B[z] (A ⊆ B)` recebe `z` (G096). Como a variável nova não aparece em nenhum
outro lugar da fórmula, ela não prende nem é presa por nada.

**Domínio.** Em `∀x∈S φ` e `∃x∈S φ`, `S` é lido fora do quantificador. Por isso
a variável `x` não pode aparecer em `S` como termo, nem dentro de argumento ou
de índice (E18): a expansão põe `x ∈ S` dentro do ∀x, e ali essa ocorrência
seria presa. O nome de uma função não conta. `∀x∈A ∀y∈x P(y)` é aceita: o `x`
do domínio de dentro é o do quantificador de fora (G113).

`∀x∈ℝ` e `∀x∈ℤ` não são expandidos: marcam a variável como número.

## 6. Formato das árvores

Os exemplos escrevem a árvore como S-expressão:

| Nó | Escrita |
| --- | --- |
| Predicado com argumentos | `(P a b)` |
| Proposição | `A` |
| Relação | `(= a b)`, `(∈ a A)`… com o símbolo canônico |
| Não, necessário, possível | `(¬ φ)`, `(□ φ)`, `(◇ φ)` |
| Crença | `(B "titular" φ)`, com o titular entre aspas |
| Conectivos | `(∧ φ ψ)`, `(∨ φ ψ)`, `(⟹ φ ψ)`, `(⟺ φ ψ)` |
| Quantificador | `(∀ x φ)`, `(∃ x ∈ D φ)` |
| Nome, número, vazio | `a`, `2`, `∅` |
| Aplicação, índice | `(f a)`, `(_ x i)` |
| Contas e conjuntos | `(+ a b)`, `(− a)`, `(^ a b)`, `(⋂ A B)`, `(⋃ A B)` |
| Verdadeiro, falso | `⊤`, `⊥` (só na árvore expandida) |

`arvore` é a árvore lida, sem expansão. `arvoreExpandida` é a árvore depois da
seção 5, presente só quando a fórmula é aceita.

## 7. Limites

| Situação | O que acontece |
| --- | --- |
| Aninhamento de até 200 níveis (parênteses, prefixos, quantificadores, sinais, aplicações), em qualquer mistura | Tem de ser aceito |
| Árvore com profundidade até 2.000 (por exemplo, 1.999 termos ligados por ∧) | Tem de ser aceita |
| Árvore com profundidade acima de 2.000 | Tem de ser recusada com E0 |
| Aninhamento entre 200 e 2.000 níveis | Cada implementação pode recusar com E0, por limite de recursos |

O Caderno recusa acima de 500 descidas abertas no leitor, cerca de 250 níveis.

## 8. Avisos de escopo e de sobrescrito

- **E14**: aparece se, e só se, o corpo de um quantificador começa com `(` e
  continua depois do `)` que fecha esse `(`.
- **E16**: aparece se, e só se, o corpo de um quantificador não começa com `(` e
  tem ∧, ∨, ⟹ ou ⟺ no topo; nunca junto com o E14 no mesmo quantificador; um
  aviso por quantificador. A mensagem mostra a fórmula inteira de dois jeitos: a
  mesma fórmula, com o corpo do quantificador entre parênteses (sem aviso), e a
  outra fórmula, em que o quantificador vale só para a primeira parte do corpo.
  Pode ser desligado sem mudar a árvore nem o certificado.
- **E17**: aparece em todo nome que tem um dos doze sobrescritos da seção 1.1.

## 9. Conformidade

Uma implementação está conforme os exemplos quando, para cada exemplo de
`exemplos-m2.json`, lendo `texto` com as `fichas`:

1. aceita ou recusa como `aceita`;
2. monta a árvore `arvore` (ou nenhuma, quando é `null`);
3. monta a árvore expandida `arvoreExpandida`, quando aceita;
4. emite os diagnósticos de `diagnosticos`, com o mesmo código, o mesmo nível e
   o mesmo `inicio`, na mesma ordem (seção 3.1); nos erros de sintaxe, E0 a E3,
   o `inicio` é informativo.

Os textos das mensagens não fazem parte da conformidade. Os exemplos foram
tirados do leitor atual: são exemplos de caracterização, não interpretações
estabelecidas de forma independente. Uma divergência entre implementações é
classificada como falha de implementação, lacuna da especificação ou decisão
pendente, e não é resolvida a favor de nenhum dos leitores por padrão.
