# Como contribuir com o Caderno Lógico

Este guia diz como propor uma mudança e o que cada mudança precisa para entrar.

## O caminho

1. Abra uma issue dizendo o que quer mudar e por quê. Para um erro, diga como
   reproduzir: a fórmula exata, a mensagem e o navegador.
2. Faça a mudança num fork, num ramo próprio, e abra um pull request que cite a
   issue.
3. Rode os testes antes de pedir revisão:
    - `npm test` tem de passar. A suíte usa o Z3 em WebAssembly; com pouca
      memória, rode `npx vitest run --maxWorkers=3`.
    - `npm run typecheck` não pode dar erro.
    - Se a mudança mexer em `especificacao/provas-t1/`,
      `python3 especificacao/provas-t1/conferir.py --sem-carcara` tem de
      passar, e o fluxo "Conferir as provas" do GitHub, com o Carcara, também.
4. Toda mudança traz o teste que a confere.

## O que tem versão e não muda no lugar

- **A gramática** (`especificacao/gramatica-m2.md` e os JSON da m2) está
  fechada no commit `091f631`. Mudar a linguagem é criar a m3; a m2 não muda.
- **A tradução para o Z3** (`especificacao/traducao-z3-t1.md`) está fechada no
  commit `11a6b3a`. Mudar o sentido é criar a t2; a t1 não muda.
- **Os exemplos normativos** só crescem: um exemplo publicado não muda de
  resposta sem uma versão nova.
- **O que é do verificador**: as regras RARE de
  `especificacao/provas-t1/regras.rare`, com o SHA-256 fixo em `conferir.py`.
  Uma regra nova ou mudada é um axioma novo. Ela só entra por revisão, com a
  justificativa de por que vale, e o mesmo pull request muda o hash em
  `conferir.py`.

## O que nunca sobe

- Conteúdo privado: a pasta `privado/` fica fora do Git, e o Principia só entra
  cifrado.
- Chaves, senhas, tokens ou qualquer outro segredo.
- Texto, dados ou código de terceiros sem a licença e o crédito; veja
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Auditorias

Quem quiser conferir o Caderno por fora usa um lote cego. Registra o SHA-256
das próprias respostas antes de ver as do Caderno, e só depois os dois lados se
revelam. Cada divergência vira uma issue, com o caso exato.

## A assinatura (DCO)

Cada commit leva uma linha de assinatura no fim da mensagem:

```
Signed-off-by: Seu Nome <seu-email@exemplo.org>
```

`git commit -s` põe essa linha sozinho. Com ela, você declara o que diz o
[Developer Certificate of Origin, versão 1.1](https://developercertificate.org/):
que a contribuição é sua, ou que você tem o direito de enviá-la nesses termos,
e que ela pode ser publicada com a licença do projeto. Ninguém cede direitos ao
projeto, e por isso trocar a licença depois exige o acordo de quem contribuiu.

Quem contribui licencia a contribuição nos termos de [LICENCAS.md](LICENCAS.md):
AGPL-3.0-or-later para código, CC BY 4.0 para textos e axiomas.

## Falhas de segurança

Não abra issue pública para uma falha de segurança. O caminho está em
[SECURITY.md](SECURITY.md).
