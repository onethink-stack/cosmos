# Pacote de conformidade da gramática — versão m2

Este pacote permite escrever outro leitor de fórmulas do Caderno Lógico sem
olhar o código do Caderno, e comparar os dois.

| Arquivo | Conteúdo |
| --- | --- |
| `gramatica-m2.md` | A especificação: léxico, PEG normativa, escopo, precedência, etapas, dicionário, expansão, formato das árvores, limites, avisos e conformidade |
| `lexico-m2.json` | Os símbolos e todas as grafias aceitas, na ordem em que o léxico os tenta; regras de nome, índice e número; adjacências |
| `diagnosticos-m2.json` | Os códigos E0 a E18: nível, etapa, condição exata, posição e a ordem em que são escolhidos |
| `exemplos-m2.json` | Os exemplos normativos: texto, fichas do dicionário, se é aceito, árvore, árvore expandida e diagnósticos |

Os quatro arquivos são conferidos pelo Caderno a cada mudança: `testes/gramatica.test.ts`
lê `exemplos-m2.json`, `lexico-m2.json` e `diagnosticos-m2.json` e falha se o
leitor do Caderno discordar de qualquer linha.

## Como usar

Para cada exemplo de `exemplos-m2.json`, leia `texto` com as `fichas` e compare
com `aceita`, `arvore`, `arvoreExpandida` e `diagnosticos` (código, nível e
`inicio`, na ordem). O formato das árvores está na seção 6 de `gramatica-m2.md`;
a posição e a ordem dos diagnósticos, na seção 3.1. O `inicio` conta caracteres
Unicode (pontos de código), não unidades de UTF-16; nos erros de sintaxe, E0 a
E3, ele é informativo.

Uma divergência é classificada como falha de implementação, lacuna da
especificação ou decisão pendente; ela não é resolvida a favor de nenhum dos
leitores por padrão.

## Versões

Semântica **m2**, tradução para o Z3 **t1**. Uma mudança de sentido só entra
com uma versão nova, e os arquivos da versão anterior continuam aqui.
