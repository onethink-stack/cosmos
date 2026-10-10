# Caderno Lógico — versão 3

Aplicativo pessoal e offline para escrever notas e fórmulas em lógica simbólica,
separar **lei**, **fato** e **visão de mundo**, validar fórmulas e detectar
contradições. Sem IA e sem servidor: todos os dados ficam no aparelho.

## O que o painel Contradições faz

- **Verificar tudo**: procura um cenário (até N objetos) onde todas as notas
  ativas valem. Sem cenário, mostra o menor conjunto de notas em conflito e,
  para cada nota, **por que ela é necessária**: um cenário onde as outras valem
  e ela falha, com o ponto exato da falha.
- **Perguntar**: "esta fórmula segue das minhas notas?" Responde *segue* (com
  as notas necessárias), *não segue* (com um contraexemplo) ou *contradiz*.
- **Descobrir consequências**: lista consequências simples (igualdades,
  pertinências, inclusões, "não é vazio", predicados, valores de função) com
  as notas de origem.
- **Conjuntos**: *Leis e fatos*; cada *Visão de [titular]* à parte; e *Tudo
  junto*, em que cada crença entra como `B[titular] (φ)` — a crença não vira
  verdade, mas uma lei sobre o necessário (□) pode contradizê-la.
- O motor normal vale "até N objetos" (e até K mundos, com lógica modal): é um
  indício forte, não prova. Com o **Z3** ligado, a resposta vira prova.

## Sistemas prontos

Em **Notas → Sistemas prontos** ficam conjuntos de notas e fichas que vêm
dentro do app. Sistemas pessoais vão **cifrados**: só quem tem a senha consegue
abri-los; no site e no código público só existe o texto embaralhado.

## Lógica modal

| Escrita | Atalho | Significado |
|---|---|---|
| `□φ` | `\nec` ou `[]` | φ é necessário (vale em todos os mundos possíveis) |
| `◇φ` | `\pos` ou `<>` | φ é possível (vale em algum mundo) |
| `B[titular] φ` | botão `B[ ]` | o titular acredita que φ; aceita várias palavras: `B[Igreja Católica] φ` e aninhamento: `B[x] B[y] φ` |

Semântica (mundos possíveis de Kripke): os objetos e as constantes são os mesmos
em todos os mundos; o que pertence a quem, os predicados e as funções podem
mudar de mundo para mundo. □ e ◇ seguem S5. Crenças seguem KD45: são
consistentes entre si, e quem acredita sabe que acredita (e que não acredita).
Acreditar não torna verdadeiro: `B[x] P(a) ⟹ P(a)` **não** segue.

## Z3 (prova sem limite de tamanho)

O motor normal procura cenários de até N objetos. O Z3 (WebAssembly, 35 MB)
trabalha em lógica de primeira ordem sem limite: "contradição" vira **provada**,
"segue" vira **provado**, e um falso alarme do motor finito (algo que só tem
modelo grande ou infinito) é desmentido. Às vezes o Z3 responde "não decidiu"
— comum quando só cenários infinitos resolveriam.

- Ligue em **Offline · Backup → Z3** ou no painel Contradições.
- Só é baixado quando ligado. "Guardar o Z3 no aparelho" o deixa disponível
  sem internet.
- Funciona no app publicado/instalado. Não existe no arquivo único.

## Usar offline

Em **Offline · Backup**:

1. **Instalar o app** (botão, quando o navegador oferece; ou menu ⋮ → Instalar
   app). Depois de aberto uma vez, funciona sem internet.
2. **Baixar `caderno-logico.html`**: o app inteiro num arquivo só (≈190 KB),
   para abrir com duplo clique no computador.
3. **Guardar o Z3 no aparelho** (35 MB), para provar sem internet.

## Duas formas de usar

| | Arquivo único | PWA (GitHub Pages) |
|---|---|---|
| O que é | `caderno-logico.html`, um só arquivo com tudo dentro | site publicado, instalável na tela inicial |
| Internet | nunca | só no primeiro acesso |
| Z3 | não | sim (sob demanda) |
| Onde ficam os dados | IndexedDB do navegador, ligado ao caminho do arquivo | IndexedDB do navegador, ligado ao endereço do site |

As duas formas **não compartilham dados** entre si. Para levar notas de uma
para a outra (ou de um aparelho para outro), use **Baixar backup** e
**Importar** do outro lado.

## Comandos

Requer Node.js 22 ou mais novo.

```bash
npm install            # uma vez
npm run dev            # desenvolvimento: http://localhost:5173 (e IP da rede local)
npm test               # todos os testes (T1–T8, modal e Z3 incluídos)
npm run build          # arquivo único + PWA em dist/ (com o Z3 em dist/z3/)
npm run build:arquivo  # só o arquivo único, em dist-arquivo/index.html
npm run preview        # serve dist/ para testar o PWA localmente
npm run icones         # regenera os ícones em public/
```

## Publicar no GitHub Pages

O repositório já está ligado ao GitHub Pages (Settings → Pages → Source:
GitHub Actions). A cada `git push`, o fluxo "Publicar no GitHub Pages" roda os
testes, faz o build e publica. O app instalado pega a versão nova na próxima
vez que for aberto com internet.

O GitHub Pages não envia os cabeçalhos de isolamento que o Z3 exige; o service
worker do app os acrescenta. Por isso, na primeira visita, o Z3 pode pedir para
recarregar a página uma vez.

**Atenção:** um repositório público expõe só o *código*. As notas nunca saem
do aparelho — a não ser que você coloque um arquivo de backup no repositório.
Não faça isso.

## Backup

- **Baixar backup** gera `caderno-logico-AAAA-MM-DD.json` com notas,
  dicionário e o valor de N.
- **Importar**: *Mesclar* (entra o que é novo, atualiza o que tem a mesma
  identificação) ou *Substituir tudo*.
- O app lembra de fazer backup a cada 7 dias.
- Apagar os dados do site no navegador, ou desinstalar o app, **apaga as
  notas**. Guarde backups fora do aparelho.

## Limites

- O motor normal procura modelos com **até N objetos** (padrão 8) e, com lógica
  modal, **até K mundos** (padrão 3). Use o Z3 para provar.
- Fórmulas com muitos quantificadores aninhados podem passar do limite de
  tamanho ("grande demais"); o Z3 continua respondendo nesses casos.
- Não há axioma de extensionalidade: dois conjuntos com os mesmos elementos
  podem ser objetos diferentes. Se quiser, escreva-o como lei:
  `∀s ∀t ((∀z (z ∈ s ⟺ z ∈ t)) ⟹ s = t)`.
- ⋂ e ⋃ só à direita de ∈/∉, nos lados de ⊆ ou em `∀x∈…`.

## Códigos do validador

| Código | Nível | Significado |
|---|---|---|
| E0 | erro | sintaxe (caso geral, inclusive `B[…]` mal formado) |
| E1 | erro | operador sem operando |
| E2 | erro | termo usado onde se esperava fórmula (ex.: `¬A`, `□A`) |
| E3 | erro | duas fórmulas lado a lado sem conectivo |
| E4 | erro | quantificador sobre constante do dicionário |
| E5 | aviso | variável quantificada de novo dentro do escopo |
| E6 | aviso | nome usado fora do escopo do seu quantificador |
| E7 | erro | parênteses desbalanceados |
| E8 | erro | símbolo desconhecido |
| E9 | erro | contradição imediata `t ≠ t` |
| E10 | erro | nome usado como tipos/aridades incompatíveis |
| E11 | erro | ⋂/⋃ em posição não suportada |
| E12 | aviso | nome sem ficha no dicionário |
| E13 | aviso | nome sem ficha parecido com um do dicionário ("você quis dizer…?") |

## Estrutura

```
src/logica/   lexer, parser, validador, açúcar sintático, atalhos, distância de nomes
src/motor/    aterramento (objetos e mundos), SAT CDCL, conflito mínimo, explicações,
              perguntar, descobrir, tradução para o Z3, worker
src/dados/    tipos, IndexedDB, estado, filtros, backup, verificação, Z3, instalação
src/ui/       telas (Preact)
testes/       vitest
```
