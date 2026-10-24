# Autorização limitada — conferência CPU Linux Carcara

Após a aprovação do pin específico, foi solicitado explicitamente ao operador: “commit e push somente da seleção pública e do novo workflow na branch codex/fase4-carcara-alethe, para executar Actions; sem merge em main/master, sem deploy e sem GPU”. O operador respondeu **“eu autorizo”** nesta conversa.

Essa autorização posterior permite publicar a seleção explícita inventariada em `FASE4_CARCARA_PUBLICACAO.json` e executar o workflow novo `fase4-carcara-conferencia.yml`. Não amplia a autorização original do pin para outros usos; complementa-a com a publicação limitada. A declaração anterior que excluía publicação permanece como registro histórico de seu próprio escopo.

Runner: `ubuntu-22.04`; Node `22.14.0`; `contents: read`; `persist-credentials: false`; sem referência a secrets, instalação Rust, inferência Groq ou deploy. Download HTTPS do asset oficial, pin SHA-256 conferido antes de executar, positivo primeiro e quatro negativos reais apenas se o positivo passar.

P1 `33e8c48e5e89b475c34c268a3ad7ea65f96c31f5`, CI histórica `40090389127`, workflow/verificador P1, arquivos protegidos e main/master ficam fora das alterações. Os três arquivos locais preexistentes alterados não entram no commit.

O inventário enumera apenas caminhos novos/alterados desta entrega pública e seus hashes; não inclui a si próprio para evitar referência circular. O commit Git vincula também o inventário. A publicação usa o histórico público P1 como base, sem reescrevê-lo.

`dist/cosmos-502426c.json` pode estar ausente no checkout Linux sem build. O recibo deve listar esse arquivo como não aferido nesse ambiente e nunca alegar 13/13 no runner a partir de 12 arquivos. A preservação integral é conferida no workspace local antes e depois da publicação.

Não há aprovação antecipada de prova, compatibilidade Carcara/cvc5, negativos semânticos, homologação Windows ou execução GPU. Falha do positivo interrompe negativos e deve ser reportada com o diagnóstico real. **B GPU continua pendente.**

## Ajuste da extração após primeiro diagnóstico real

O run `40118276380` do commit `c905df54b3e3e3b2adf5cb87aa68fa6e73456747` conferiu o pin e executou Carcara 1.1.0, mas o positivo falhou com `parser error: unexpected token: '(' (on line 2, column 1)`. Nenhum negativo foi executado nesse run. O adaptador inicial havia removido `unsat`, mas conservado o contêiner externo do dump cvc5.

A correção prepara um artefato derivado em diretório separado, removendo somente o prefixo `(` + CRLF e o sufixo `)` + CRLF, sem editar passos internos. Essa extração corresponde à remoção das duas primeiras linhas (`unsat`, `(`) e da última (`)`) documentada em `cvc5-1.4.2/contrib/get-carcara-checker`. Não são adotadas as flags permissivas presentes naquele script: o checker e o pin aprovados permanecem iguais.

A prova original de 5357 bytes e SHA `68c77a0feaaf9bc8ecb06a4b28b0bc8fca83225ce7f93c69fe5bff8b8e9db934` e seu certificado ficam intactos. O recibo distingue prova original, corpo efetivamente conferido, hashes e transformação reversível. Não se atribui à conferência do corpo a alegação de que o arquivo original foi aceito sem extração. Os negativos são construídos sobre o corpo conferido, mantendo a entrada original. A publicação corretiva continua restrita aos arquivos públicos da conferência e ao inventário explícito.
