# Certificados dos exemplos da t1 — versão c1

Esta pasta guarda, para os 42 exemplos normativos da tradução t1
(`../traducao-z3-t1-exemplos.json`), o problema exato que o Caderno manda ao Z3
e, para os unsat, uma prova passo a passo no formato Alethe, que outro programa
confere sem confiar em nenhum solucionador.

| Arquivo | O que é |
| --- | --- |
| `problemas/Zxx.smt2` | O problema em SMT-LIB 2: as declarações e as asserções que a tradução t1 produz (a função `problemaSmt` de `src/motor/z3.ts`), com as fórmulas do exemplo num comentário no topo |
| `provas/Zxx.alethe` | A prova Alethe do cvc5 para esse problema, só os comandos (a linha `unsat` e os parênteses de fora foram tirados) |
| `regras.rare` | As 17 regras de reescrita (RARE) que as provas usam, copiadas do Carcara (com uma única mudança de escrita, anotada no topo do arquivo) |
| `certificados.json` | O registro: para cada exemplo, fórmulas, fichas, árvores expandidas, versão da tradução, veredito do Z3, problema e prova, com SHA-256 |
| `conferir.py` | O verificador: confere as provas com o Carcara, estraga cada prova de sete jeitos e roda os casos adversários |
| `adversarios/` | Problemas satisfazíveis com "provas" falsas escritas à mão, que o verificador tem de recusar |

## O que é do verificador e o que é do certificado

Quem emite um certificado não escolhe os axiomas com que ele vai ser conferido.
O verificador é `conferir.py`, o Carcara (num commit fixo, compilado por um Rust
de versão fixa) e o arquivo `regras.rare`, cujo SHA-256 está escrito no próprio
`conferir.py` (`REGRAS_CONFIADAS_SHA256`). O certificado é o problema, a prova e
o registro. Se um pacote trouxesse outro arquivo de regras, com uma regra falsa
e o hash atualizado no registro, o verificador recusaria, porque compara o
arquivo com o hash dele, e não com o do pacote. Mudar uma regra exige mudar o
verificador, e essa mudança é revista.

## O certificado

Um certificado de unsat liga quatro coisas, e cada elo é conferido por um
caminho diferente:

1. **a fórmula à árvore expandida**, pela gramática m2, que dois leitores
   independentes leem igual (lotes cegos de 750 e 1.000 casos);
2. **a árvore ao problema SMT**, pela tradução t1. `testes/provas-t1.test.ts`
   refaz o texto de cada problema e falha se ele mudar; a auditoria da t1 está
   na seção 8 de `../traducao-z3-t1.md`;
3. **o problema à prova**, pelo Carcara, que confere cada passo;
4. **a prova à regra de cada passo**, pelas regras do Alethe e pelo arquivo
   `regras.rare`.

## Como as provas foram feitas

Com o cvc5 1.4.2 (`cvc5-Win64-x86_64-static.zip`, SHA-256
`9055de9b724724890ba5a19cfdc98f68a8c0653284afa843096dec432a0f88c3`, do GitHub do
cvc5) e as opções

```
--dump-proofs --proof-format-mode=alethe --proof-granularity=dsl-rewrite
--proof-alethe-res-pivots --simplification=none --dag-thresh=0 --tlimit=20000
```

mais `--enum-inst` em Z16, Z20, Z21 e Z24, que sem ele o cvc5 não decide em
20 s. Nenhuma prova tem passo `hole` ou `trust`. Cada uma também passou pela
conferência interna do cvc5 (`--check-proofs`), que não conta como
independente.

## Resultado nos 42 exemplos

| Veredito do Z3 | Exemplos | Certificado |
| --- | --- | --- |
| unsat | 28 | Prova Alethe |
| unsat | Z36 (potência à direita) | **Nenhum.** A tradução usa a potência real do Z3 (`^`), que o Alethe não tem |
| unsat | Z40 (divisão por zero) | **Nenhum.** O cvc5 resolve com um símbolo interno (`div_by_zero`) que o Alethe não escreve |
| sat | 10 | O de um sat é um modelo, não uma prova |
| unknown | Z19, Z22 | Nenhum. O cvc5 com `--finite-model-find` dá sat nos dois |

Z36 e Z40 são unsat pela palavra dos solucionadores (o Z3 e o cvc5 concordam),
mas ficam fora do formato de certificado.

## A conferência independente

O fluxo `../../.github/workflows/conferir-provas.yml` roda numa máquina do
GitHub a cada mudança nesta pasta. Ele compila o Carcara da versão em
desenvolvimento, no commit fixo `20bf49c5ce31089ac83118574c888669355aaae1`,
com o Rust 1.99.1 numa máquina `ubuntu-24.04` (os três fixos: o mesmo commit
compilado por outro Rust, ou noutro sistema, não é a mesma compilação), e roda
`conferir.py`, que

- confere o SHA-256 de cada arquivo com o registro;
- roda, para cada prova,
  `carcara check --allow-int-real-subtyping --expand-let-bindings --rare-file regras.rare provas/Zxx.alethe problemas/Zxx.smt2`
  pelos dois modos, cada um sozinho: a resolução conferida pelos pivôs que o
  cvc5 dá em cada passo, e com `--rup-resolution`, que confere cada resolução
  por propagação de unidades, sem depender dos pivôs. Os dois modos são
  corretos; o fluxo exige `valid` em pelo menos um, e o relatório mostra os
  dois para cada prova;
- estraga cada prova de até sete jeitos, um de cada vez, e o Carcara tem de
  recusar todos, pelos dois modos (veja abaixo). O relatório diz de onde veio
  cada recusa, pelo modo em que a prova original passa;
- roda os casos de `adversarios/`, que também têm de ser recusados.

### Os estragos

Cada estrago muda uma coisa só e deixa a prova bem escrita, para que a recusa
venha da lógica e não da forma. O relatório diz de onde veio cada recusa: da
leitura (um passo citado fora do escopo dele, um tipo errado, ou outro erro de
leitura), da regra de um passo (e qual), ou da falta da cláusula vazia no fim.

| Estrago | O que testa |
| --- | --- |
| um literal negado | a conclusão de um passo trocada por outra |
| um literal tirado de uma resolução | uma cláusula mais forte do que a resolução dá, como concluir q de p ∨ q e ¬p ∨ r |
| uma premissa trocada por um passo anterior visível no mesmo escopo | uma inferência errada com premissas que estão disponíveis |
| uma premissa trocada por um passo de uma subprova já fechada | a disciplina de escopo |
| a regra de um passo trocada por `false`, sem premissas nem argumentos | uma regra que não justifica a conclusão |
| a conclusão de um `rare_rewrite` (= L R) trocada por (= L L) | uma igualdade verdadeira que não é instância da regra |
| uma suposição trocada pela negação dela | o elo entre a prova e o problema |

Ficam de fora os estragos que deixariam o passo certo, porque aí aceitar não
seria erro:

- numa resolução, o passo estragado que ainda segue das premissas por
  propagação de unidades, o critério do segundo modo. Isso pega, por exemplo,
  tirar uma de duas cópias do mesmo literal, negar uma de duas cópias (a
  cláusula vira X ∨ ¬X) ou trocar uma premissa por outra que também dá a
  conclusão;
- a premissa trocada por um passo com a mesma cláusula, sem contar a ordem dos
  literais nem a dos lados das igualdades, que `trans`, `cong` e a conferência
  das suposições do Carcara não distinguem;
- os passos que a regra `false` provaria;
- os `rare_rewrite` em que L e R só diferem pela ordem dos lados de
  igualdades: ali (= L L) é a própria instância a menos dessa ordem, e aceitar
  não seria erro.

A propagação de unidades desse filtro copia a do Carcara (a função `rup` de
`src/checker/rules/resolution.rs`, no commit fixo): ela compara os literais sem
as negações de fora e usa só as premissas do passo. O filtro só escolhe os
estragos; não confere prova nenhuma. A troca de premissa por um passo de
subprova fechada fica sem filtro: usar um passo fora do escopo dele é erro
mesmo que a cláusula feche a conta.

### Os casos adversários

| Caso | O ataque |
| --- | --- |
| `rup-resolvente-falso` | de p ∨ q e ¬p ∨ r, concluir q (o resolvente certo é q ∨ r) |
| `rare-tipo-errado` | aplicar `arith-leq-norm`, que só vale para inteiros, a dois reais |
| `forall-inst-errado` | instanciar um ∀ e tirar a condição dele |
| `premissa-fora-do-problema` | supor uma fórmula que não está no problema |
| `regra-fora-do-arquivo-confiado` | trazer uma regra falsa (p = true) num arquivo de regras do próprio certificado (`atacante.rare`) |

Os cinco problemas são satisfazíveis (o cvc5 confere), então aceitar qualquer
uma dessas "provas" seria erro do verificador. No último, o relatório mostra
também o que aconteceria se o verificador usasse o arquivo de regras do
atacante.

O resultado sai em anotações na página de cada execução, na aba Actions, que
qualquer pessoa vê sem login (o registro completo só abre para administradores).

**A primeira rodada** usou o commit `394edbb15ba95c47893f1d821fddde7e016af178`,
o que o roteiro `contrib/get-carcara-checker` do cvc5 1.4.2 indica (o fork de
onde o roteiro baixava foi incorporado ao `ufmg-smite/carcara`). Ela deu `valid`
em 26 das 28 provas. Z34 e Z37 foram recusadas por usar duas regras de
aritmética não linear que essa versão não conhece (`la_mult_sign` e
`la_mult_abs_comparison`); a versão em desenvolvimento conhece as duas. Dos 84
estragos, 83 foram recusados. O aceito não era estrago: a regra `bind` de um
passo que conclui `(= t t)` tinha sido trocada por `refl`, que também prova
isso, e a prova continuava certa. Desde então a regra de um passo é trocada
por `false`, que só prova `(cl (not false))`, e esses passos ficam de fora.

**A segunda rodada**, já com o commit `20bf49c`, deu `valid` em 27 das 28
provas, e os 84 estragos foram recusados. Z34 (raiz de 2 nos inteiros) foi
recusada num passo de resolução (`t423.t8`): o pivô que o cvc5 indica, um
literal com um termo `choice` que ele criou para um quantificador, não foi
achado na cláusula da premissa. Daí o segundo modo, por propagação de unidades,
que não depende dos pivôs.

**A terceira rodada** (commit `61c602c`) deu `valid` nas 28 provas, 27 pelos
pivôs e Z34 por RUP, e os 84 estragos de então foram recusados. Uma auditoria
independente desses estragos mostrou que eles testavam mais a forma do que a
lógica: 11 das 28 premissas trocadas apontavam para passos posteriores, as
regras trocadas por `false` guardavam premissas e argumentos, e nenhum estrago
atacava um `rare_rewrite`. Os estragos foram refeitos como acima, e os casos
adversários entraram.

**A quarta rodada** (commit `3ed62b5`, a primeira com os sete estragos) deu
`valid` nas 28 provas, 27 pelos pivôs e as 28 por RUP sozinho; os 176 estragos
e os 5 casos adversários foram recusados, e com o arquivo de regras do atacante
a prova falsa passou. As classes das recusas saíram incompletas: a linha de
comando do Carcara escreve os erros de leitura sem prefixo, e põe o passo e a
regra no fim da mensagem, que era cortada antes de ser classificada. A
classificação passou a usar a mensagem inteira, e o sistema da máquina ficou
fixo.

## As regras RARE

Cada regra de `regras.rare` é um axioma para o Carcara: ele confere que o passo
é uma instância da regra, não que a regra vale. Por isso o arquivo traz só as 17
que as provas usam, e cada uma é uma identidade simples que se confere à mão,
como ¬¬t = t ou (t ⟹ s) = (¬t ∨ s). O arquivo completo do Carcara tem regras que
os próprios autores marcam como não necessariamente válidas, como x/0 = 0, que
contradiz a t1 (nela, x/0 é algum número que só depende de x). Nenhuma delas
entra aqui. A única mudança em relação ao arquivo do Carcara é de escrita: em
`or-not-refl`, o parâmetro de tipo declarado `T0` e usado como `@T0` passou a
ser declarado `@T0`, como nas outras regras. A versão 394edbb aceita as duas
formas, mas o trecho que aceita a primeira não está na versão em
desenvolvimento.

## O que isto não prova

- A prova vale para o problema SMT. O elo com a fórmula é a tradução t1, que
  duas implementações conferiram, mas que não foi provada correta.
- O Carcara também é um programa, e as regras RARE entram nele como axiomas.
- Z36 e Z40 ficam sem certificado.
