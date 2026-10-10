# Caderno Lógico — versão 2

Aplicativo pessoal e offline para escrever notas e fórmulas em lógica simbólica,
separar **lei**, **fato** e **visão de mundo**, validar fórmulas e detectar
contradições. Sem IA e sem servidor: todos os dados ficam no aparelho.

## O que o painel Contradições faz

- **Verificar tudo**: procura um mundo (até N objetos) onde todas as notas
  ativas valem. Sem mundo, mostra o menor conjunto de notas em conflito e, para
  cada nota, **por que ela é necessária**: um mundo onde as outras valem e ela
  falha, com o ponto exato da falha.
- **Perguntar**: "esta fórmula segue das minhas notas?" Responde *segue* (com
  as notas necessárias), *não segue* (com um contraexemplo) ou *contradiz*.
- **Descobrir consequências**: lista consequências simples (igualdades,
  pertinências, inclusões, "não é vazio", predicados, valores de função) com
  as notas de origem.
- Visões de mundo são sempre tratadas à parte, cada titular por si.
- Tudo vale "até N objetos": é um indício forte, não prova absoluta.

## Duas formas de usar

| | Arquivo único | PWA (GitHub Pages) |
|---|---|---|
| O que é | `dist-arquivo/index.html`, um só arquivo com tudo dentro | site publicado, instalável na tela inicial |
| Internet | nunca | só no primeiro acesso |
| Melhor para | computador | celular (Android/Chrome) |
| Onde ficam os dados | IndexedDB do navegador, ligado ao caminho do arquivo | IndexedDB do navegador, ligado ao endereço do site |

As duas formas **não compartilham dados** entre si. Para levar notas de uma
para a outra (ou de um aparelho para outro), use **Backup → Baixar backup** e
**Backup → Importar** do outro lado.

## Comandos

Requer Node.js 22 ou mais novo.

```bash
npm install            # uma vez
npm run dev            # desenvolvimento: http://localhost:5173 (e IP da rede local)
npm test               # todos os testes (T1–T8 incluídos)
npm run build          # PWA em dist/
npm run build:arquivo  # arquivo único em dist-arquivo/index.html
npm run build:tudo     # os dois
npm run preview        # serve dist/ para testar o PWA localmente
npm run icones         # regenera os ícones em public/
```

### Arquivo único

Depois de `npm run build:arquivo`, copie `dist-arquivo/index.html` para onde
quiser e abra com duplo clique (Chrome, Edge ou Firefox). Não carrega nada da
internet. Se mover ou renomear o arquivo, o navegador o trata como outro
"site" e as notas não aparecem — faça backup antes e importe depois.

No celular, abrir arquivos locais é limitado: o Android pode abrir o arquivo
por um caminho onde o navegador não permite gravar dados. Se aparecer
"Armazenamento indisponível", use o PWA.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (pode ser privado só se o seu plano permitir
   Pages privado; senão, público). Ex.: `caderno-logico`.
2. Nesta pasta:
   ```bash
   git remote add origin https://github.com/SEU-USUARIO/caderno-logico.git
   git push -u origin master
   ```
3. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub
   Actions**.
4. Aba **Actions**: o fluxo "Publicar no GitHub Pages" roda os testes, faz o
   build e publica. Ao terminar, o endereço aparece no resumo — algo como
   `https://SEU-USUARIO.github.io/caderno-logico/`.
5. A cada `git push` o site é atualizado. O app instalado pega a versão nova
   na próxima vez que for aberto com internet (pode ser preciso fechar e abrir
   de novo).

O build usa caminhos relativos, então funciona em qualquer subpasta do Pages
sem configuração.

**Atenção:** um repositório público expõe só o *código*. As notas nunca saem
do aparelho — a não ser que você coloque um arquivo de backup no repositório.
Não faça isso.

## Instalar no celular (Android)

1. Abra o endereço do GitHub Pages no Chrome.
2. Menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
3. Abra uma vez com internet; daí em diante funciona offline.

## Backup

- **Backup → Baixar backup** gera `caderno-logico-AAAA-MM-DD.json` com notas,
  dicionário e o valor de N.
- **Importar**: *Mesclar* (entra o que é novo, atualiza o que tem a mesma
  identificação) ou *Substituir tudo*.
- O app lembra de fazer backup a cada 7 dias.
- Apagar os dados do site no navegador, ou desinstalar o app, **apaga as
  notas**. Guarde backups fora do aparelho.

## Limites da versão 1

- O motor procura modelos com **até N objetos** (padrão 8). "Sem modelo até N"
  indica provável contradição, **não é prova**: um modelo maior ou infinito
  ainda poderia existir.
- Fórmulas com muitos quantificadores aninhados podem passar do limite de
  tamanho ("grande demais para a versão 1").
- Não há axioma de extensionalidade: dois conjuntos com os mesmos elementos
  podem ser objetos diferentes. Se quiser, escreva-o como lei:
  `∀s ∀t ((∀z (z ∈ s ⟺ z ∈ t)) ⟹ s = t)`.
- ⋂ e ⋃ só à direita de ∈/∉, nos lados de ⊆ ou em `∀x∈…`.

## Códigos do validador

| Código | Nível | Significado |
|---|---|---|
| E0 | erro | sintaxe (caso geral) |
| E1 | erro | operador sem operando |
| E2 | erro | termo usado onde se esperava fórmula (ex.: `¬A`) |
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
src/motor/    aterramento em domínio finito, SAT CDCL, conflito mínimo, worker
src/dados/    tipos, IndexedDB, estado, filtros, backup, verificação
src/ui/       telas (Preact)
testes/       vitest
```
