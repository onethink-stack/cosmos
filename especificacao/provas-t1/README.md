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
| `conferir.py` | Confere as provas com o Carcara e testa provas estragadas de propósito |

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
desenvolvimento, no commit fixo `20bf49c5ce31089ac83118574c888669355aaae1`, e
roda `conferir.py`, que

- confere o SHA-256 de cada arquivo com o registro;
- roda, para cada prova,
  `carcara check --allow-int-real-subtyping --expand-let-bindings --rare-file regras.rare provas/Zxx.alethe problemas/Zxx.smt2`
  e exige `valid`;
- faz três estragos em cada prova (um literal negado, uma premissa trocada ou
  tirada, e a regra de um passo trocada pela regra `false`), e o Carcara tem de
  recusar os três.

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
