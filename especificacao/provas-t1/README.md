# Certificados dos exemplos da t1 — versão c3

Esta pasta guarda, para os 42 exemplos normativos da tradução t1
(`../traducao-z3-t1-exemplos.json`), o problema exato que o Caderno manda ao Z3;
para os unsat, uma prova passo a passo no formato Alethe; para os sat sem
números, um modelo finito; e para os sat com números, um modelo exato
(`../modelos-exatos-t1.md`). Outros programas conferem as provas e os modelos
sem confiar em nenhum solucionador e sem fazer busca.

| Arquivo | O que é |
| --- | --- |
| `problemas/Zxx.smt2` | O problema em SMT-LIB 2: as declarações e as asserções que a tradução t1 produz (a função `problemaSmt` de `src/motor/z3.ts`), com as fórmulas do exemplo num comentário no topo |
| `provas/Zxx.alethe` | A prova Alethe do cvc5 para esse problema, só os comandos (a linha `unsat` e os parênteses de fora foram tirados) |
| `regras.rare` | As 17 regras de reescrita (RARE) que as provas usam, copiadas do Carcara (com uma única mudança de escrita, anotada no topo do arquivo) |
| `certificados.json` | O registro: para cada exemplo, fórmulas, fichas, árvores expandidas, versão da tradução, veredito do Z3, problema e prova, com SHA-256, e o modelo de cada sat |
| `conferir.py` | O verificador: confere as provas com o Carcara, estraga cada prova de sete jeitos, roda os casos adversários e confere o vínculo da fórmula com o problema |
| `vinculo.py` | A parte do verificador que refaz o problema a partir das fórmulas e o compara com o do certificado |
| `modelos.py` | A parte do verificador que confere os modelos dos sat, finitos e exatos, com a conferência independente |
| `registros.py` | A parte do verificador que confere os registros de exemplo do formato aberto (`../registros-v1/`) e o lote cego 1 (`../registros-v1/lote-cego-1/`), com a leitura e a tradução independentes e o Carcara, e que roda também o leitor de registros do GPT |
| `requisitos.txt` | O SymPy e o mpmath, com versão e hash fixos, para a conferência independente dos modelos exatos |
| `independente/` | A implementação independente, escrita pelo GPT só pela especificação, sem mudança nenhuma: o leitor da m2, a tradução t1, as conferências de modelo (finito e exato) e o leitor de registros |
| `adversarios/` | Problemas satisfazíveis com "provas" falsas escritas à mão, e um certificado com as fórmulas trocadas, que o verificador tem de recusar |

## O que é do verificador e o que é do certificado

Quem emite um certificado não escolhe os axiomas nem a tradução com que ele vai
ser conferido. O verificador é `conferir.py` e `vinculo.py`, o Carcara (num
commit fixo, compilado por um Rust de versão fixa), o arquivo `regras.rare`,
cujo SHA-256 está escrito no próprio `conferir.py` (`REGRAS_CONFIADAS_SHA256`), e
a implementação independente da pasta `independente/`, com o SHA-256 de cada
arquivo escrito em `vinculo.py`. O certificado é as fórmulas, o problema, a
prova e o registro. Se um pacote trouxesse outro arquivo de regras, com uma
regra falsa e o hash atualizado no registro, o verificador recusaria, porque
compara o arquivo com o hash dele, e não com o do pacote. Mudar uma regra ou a
tradução exige mudar o verificador, e essa mudança é revista.

## O certificado

Um certificado de unsat liga quatro coisas, e cada elo é conferido por um
caminho diferente:

1. **a fórmula à árvore expandida**, pela gramática m2, que dois leitores
   independentes leem igual (lotes cegos de 750 e 1.000 casos);
2. **a fórmula ao problema SMT**, pela tradução t1. O verificador refaz o
   problema a partir das fórmulas com a implementação independente (veja "O
   vínculo da fórmula com o problema", abaixo), e `testes/provas-t1.test.ts`
   refaz o texto exato com o código do Caderno. A auditoria da t1 está na seção 8
   de `../traducao-z3-t1.md`;
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
| sat | Z02, Z03, Z04, Z14, Z15 (sem números) | Modelo finito, do motor do Caderno, no formato do lote cego Z3 2 |
| sat | Z07, Z08, Z33, Z35, Z39 (com números) | Modelo exato, tirado do modelo do Z3, no formato modelo-exato-t1-v1 (em Z33, n = −√2, a raiz de x² − 2 em (−3/2, −1)) |
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

### O vínculo da fórmula com o problema

Uma prova vale para o problema que ela prova. Para valer para a fórmula, o
problema tem de ser a tradução da fórmula, e um hash não garante isso: quem
emite o certificado calcula os hashes que quiser. Por isso o verificador refaz o
problema de cada certificado a partir das fórmulas e das fichas, com a
implementação independente da pasta `independente/` (o leitor da m2 e a
tradução t1 que o GPT escreveu só pela especificação), e o compara com o
problema do certificado.

Antes de comparar, cada problema tem de estar no perfil da t1: só os comandos,
as sortes e os operadores embutidos que a tradução emite, só nomes declarados no
padrão da seção 3 (`c:`, `n:`, `f:`, `fn:`, `p:`, `R:`, `pertence`, `w0`),
nenhuma variável ligada que esconda outro símbolo, os comandos na ordem da t1
(um `(set-logic ALL)`, as sortes, as declarações, as asserções e, se houver, um
`(check-sat)` no fim) e cada termo bem tipado: cada aplicação com a aridade e as
sortes certas, e toda asserção `Bool`. Sem isso, a comparação seria enganada. O
GPT mostrou três pares de problemas de sentido diferente que versões anteriores
davam como iguais: na rodada 28, dois que declaravam funções chamadas `and` e
`-`, que o comparador tratava como a conjunção e a negação; na rodada 29, um com
o `(check-sat)` antes de uma asserção, que a consulta não vê, enquanto a
comparação olhava o conjunto todo. Na rodada 30, ele notou que o perfil não
conferia os tipos: `(and |c:a| true)`, com `c:a` objeto, passava. Os três pares
e o problema mal tipado ficam em `adversarios/comparador/`, e o verificador
exige que sejam recusados. O `conferir.py` também se recusa a rodar com
`python -O`, que tira os `assert` com que a conferência independente recusa. No
uso real não havia brecha (a tradução refeita nunca declara esses nomes, e o
Carcara confere a prova contra todas as asserções do problema), mas a comparação
tem de valer por si. Ao montar o lote cego 1 de registros, apareceu mais um: um
problema com um `)` a mais, que fecha a raiz no meio, quebrava o leitor do
vínculo (`IndexError`) e derrubava a conferência inteira. Agora o leitor recusa o
parêntese sem par, um problema que não se lê, de qualquer jeito, sai como
diferente (a comparação falha fechada), e o controle
`adversarios/comparador/parentese-a-mais-recusar.smt2` fica para isso não
voltar. A conferência do Caderno (`src/motor/vinculo.ts`) usa a mesma
comparação.

A comparação é estrutural e ignora só o que não muda o sentido: comentários,
`(set-logic)` e `(check-sat)`, as barras em volta dos símbolos, os nomes das
variáveis ligadas, os `let`, a forma de escrever um número (`2` e `2.0`), `and`
e `or` aninhados, a ordem das declarações e das asserções, e as declarações que
nenhuma asserção usa. Cada símbolo entra pelo nome-base e pela assinatura,
porque a seção 3 de `../traducao-z3-t1.md` diz que os nomes no Z3 são
informativos e que o que conta é o tipo de cada símbolo e se ele recebe o
mundo. Assim `c:n` e `n:n`, os dois `Real`, são o mesmo símbolo, e P(a) continua
diferente de P(b).

O vínculo também é atacado:

| Ataque | O que tem de acontecer |
| --- | --- |
| A fórmula com um operador trocado pelo dual (□ e ◇, ∀ e ∃, ∧ e ∨), ou negada, se não houver nenhum deles | Recusada, nos 42 certificados |
| As fórmulas de outro exemplo, com o problema e a prova deste | Recusadas, nos 42 × 41 pares |
| `adversarios/vinculo-trocado.json`: as fórmulas P(a) e ¬□P(a), que têm modelo, com o problema e a prova verdadeira de Z09, que são de P(a) e ¬◇P(a) | A prova passa no Carcara, e o vínculo recusa |
| `adversarios/comparador/`: os três pares do GPT, com funções declaradas chamadas `and` e `-`, e com um `(check-sat)` no meio; um problema mal tipado; e um com um `)` a mais | O comparador recusa os cinco |

Um achado da comparação: a especificação diz que o sufixo `[:sig]` aparece
quando os argumentos misturam números e objetos, e é assim que a implementação
independente o escreve. O Caderno também o põe quando todos os argumentos de um
predicado são números (em Z08, `p:Q/1:R`) e quando todos os argumentos de uma
função numérica são objetos. As duas também chamam as constantes numéricas de
jeitos diferentes (`n:n` no Caderno, `c:n` na outra). Como os nomes são
informativos, nada disso muda o sentido.

### Os modelos dos sat

O certificado de um sat é um modelo: os objetos, os mundos, as tabelas completas
das funções, os predicados verdadeiros, o pertence e os acessos de cada titular
(o formato está em `src/motor/certificadoModelo.ts`). Quem confere não faz busca
nenhuma: checa a forma, as tabelas, o quadro KD45 de cada titular e se cada
fórmula vale no mundo real.

Os modelos saem do motor finito do Caderno e são conferidos por duas
implementações: a do Caderno, em `testes/provas-t1.test.ts`, e a independente
(`independente/verificar_certificados_sem_z3.py`), em `modelos.py`. As duas
conferências também são atacadas: cada modelo tem de ser recusado com a primeira
fórmula negada, porque o modelo de F não satisfaz ¬F; e o verificador
independente também tem de recusar uma tabela de função sem uma linha e um
quadro de crença sem os acessos do mundo real. O modelo de um exemplo com as
fórmulas de outro não serve de ataque, porque um modelo pode valer para os
dois: o de Z04 vale para Z14.

Nos sat com números o modelo não é finito: uma função de argumento real tem
infinitos argumentos, e √2 não se escreve com decimais. O certificado é então um
modelo exato (`../modelos-exatos-t1.md`): as funções por casos, com um valor
padrão; os números como racionais ou em Q(α), com α dado por um polinômio
irredutível e um intervalo com uma raiz só (por Sturm); a divisão por zero como
uma função D0 do numerador; e uma testemunha para cada ∃ sobre ℝ ou ℤ de
polaridade positiva. O Caderno o tira do modelo do Z3 (`src/motor/z3Modelo.ts`)
e o confere em `testes/modelos-exatos.test.ts` e `testes/provas-t1.test.ts`. Na
rodada 31, o avaliador numérico do GPT (rodada 30) aceitou os cinco do Caderno,
e a conferência do Caderno aceitou os cinco dele; mas o avaliador do GPT tinha
três defeitos (a testemunha usada debaixo de ¬, ∅ fora dos objetos, e `assert`
que `python -O` tira). Consertado (`independente/avaliador_kripke_numerico_v1.py`,
do pacote da Fase 2), ele está em `modelos.py`: aceita os cinco e recusa os
estragos deles (a primeira fórmula negada, α num intervalo sem raiz, a testemunha
trocada e D0 trocado). No fluxo, ele roda com o SymPy de `requisitos.txt`. O
lote cego 1 de registros achou nele mais um defeito: sem α, uma comparação de
ordem verdadeira dava o `BooleanTrue` do SymPy, que não passava no `res is True`
do fim, e modelos certos eram recusados (com n = 3, n > 2 saía falsa). O defeito
só recusava demais. O GPT o consertou na rodada 35, com duas linhas, e é essa a
versão que está aqui.

### O lote cego 1 de registros

O passo 8 do `conferir.py` confere os 62 registros de
`../registros-v1/lote-cego-1/`, já revelados. Cada um tem de dar, no leitor do
verificador e no leitor do GPT, a resposta que o Caderno registrou antes das
respostas do GPT (`caderno.json`, o compromisso). Nas pendentes, que só tinham a
prova por conferir, o Carcara tem de dar o que o compromisso previu. O README da
pasta conta o protocolo e o resultado.

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

- A prova vale para o problema SMT. O elo com a fórmula é a tradução t1, que o
  verificador refaz a cada execução com uma segunda implementação. As duas
  foram escritas por IAs, de lados diferentes e só pela especificação, e
  nenhuma foi provada correta: um erro que as duas cometam do mesmo jeito passa.
- O Carcara também é um programa, e as regras RARE entram nele como axiomas.
- Z36 e Z40 ficam sem certificado.
- Os modelos exatos dependem do SymPy, que entra na base de confiança junto com
  o avaliador. A teoria inconsistente é conferida nos registros do formato aberto
  (`../registros-v1.md`), que separam premissas e conclusão; nos 42 exemplos,
  que são só conjuntos de fórmulas, ela não se aplica.
