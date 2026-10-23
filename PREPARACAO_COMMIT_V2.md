# Revisão do conjunto para commit único — Cosmos v2

Estado: preparação local; nenhum commit, tag, push ou deploy. O commit proposto deve conter as correções v2, o desbloqueio necessário dos testes e os ajustes Z3/SQLite. A tag v2 só poderá apontar para o commit completo resultante.

**Revisão final concluída para esse escopo local:** o snapshot com os bytes v1 exatos de `HEAD` passou em **53 arquivos, 769 testes, zero falhas, 197,02 s**, saída 0. Log `evidencias/v2-snapshot-suite-bytes-head.log`. Typecheck, build do site, bundle da API e diagnóstico também passaram. Não foi encontrado bloqueio adicional nesse conjunto; os limites operacionais descritos abaixo continuam pendentes.

## Escopo selecionado

O inventário explícito está em `COMMIT_V2_ARQUIVOS.json`. Inclui implementação v2, interface, scripts OTS/checkpoint/diagnóstico, sidecars públicos, documentação, testes e evidências desta entrega. Os quatro JSONs v1, chave pública fixada, ícones e lockfile permanecem no HEAD sem alteração e não entram como mudanças.

Mudanças locais preexistentes em `scripts/gerar-icones.mjs`, `especificacao/provas-t1/registros.py` e `especificacao/registros-v1.md` ficam fora desse conjunto. Nenhuma pasta `entrega-f*`, `fase3-independente`, `privado/`, ZIP ou artefato avulso será selecionado. `especificacao/cadeia-v1/` e `especificacao/cadeia-v1.md` permanecem intactos e fora do conjunto.

## Dependência identificada e resolvida

O teste pessoal importava `especificacao/cadeia-v1/exemplos.json`, arquivo local não rastreado pelo Git. Para que o commit seja reprodutível sem incluir a pasta protegida, o teste agora importa uma cópia em `testes/fixtures/cadeia-v1-exemplos.json`.

Origem e cópia são byte a byte idênticas, SHA-256 `2148eec32eb7ea814276a853be6d4652705c128e24a96764ec9cefb23224883c`. O original não foi editado. Os dois arquivos de testes da cadeia passaram juntos: 31/31, 22,39 s; log `evidencias/v2-fixture-commit.log`. Não houve mudança de semântica ou perda da cobertura recuperada em `testes/motor-logico.test.ts`.

## Método de conferência

Um snapshot descartável fora da pasta do projeto é construído a partir de `git archive HEAD` mais somente os arquivos do inventário. As dependências instaladas são reutilizadas por junction de `node_modules`; não é um `npm ci` novo nem um teste de instalação limpa. Os arquivos de implementação vêm do snapshot, sem incorporar outras mudanças locais.

Nessa seleção isolada são executados suíte completa, typecheck e build, para detectar dependências acidentais em arquivos não selecionados. Não há alteração do índice Git, worktree registrado, criação de branch, acesso à chave privada ou publicação externa.

### Terminadores de linha do archive

O primeiro `git archive` gerou CRLF nos quatro JSONs v1 temporários. Seus hashes diferiam dos originais LF, embora os conteúdos fossem iguais após comparar terminadores. Os originais do projeto permaneceram intactos e foram conferidos diretamente contra os blobs de `HEAD`: são byte a byte idênticos. Fontes: `evidencias/v2-snapshot-terminadores.json` e `evidencias/v2-head-dados-bytes.json`.

Após a primeira suíte isolada aprovada (769/769, 53 arquivos, 217,80 s, `evidencias/v2-snapshot-suite.log`), somente a cópia temporária desses quatro arquivos foi substituída pelos bytes exatos dos blobs de `HEAD`. `evidencias/v2-snapshot-preservacao.json` passa a registrar a comparação final de dados e ícones, oito arquivos idênticos. O diagnóstico inicial com CRLF foi preservado em `evidencias/v2-snapshot-conferencia-archive.json`; não é apresentado como confirmação dos hashes v1 originais.

Os arquivos de código/testes/scripts/configuração/sidecars selecionados são byte a byte idênticos entre projeto e snapshot: `evidencias/v2-snapshot-codigo-identico.json`. A cópia dos exemplos em `testes/fixtures` permite reproduzir a suíte sem incluir a pasta protegida `especificacao/cadeia-v1`.

### Resultado final da seleção

- Inventário final: 92 arquivos, incluindo documentação e evidências. Os registros adicionais do teste isolado não introduzem outra implementação além da seleção inicialmente montada.
- Suíte final com bytes v1 exatos: `evidencias/v2-snapshot-suite-bytes-head.log` — 769/769, 53 arquivos, 197,02 s, saída 0.
- Tipos: `evidencias/v2-snapshot-typecheck.log` — saída 0.
- Build do site após conferência dos bytes: `evidencias/v2-snapshot-build-bytes-head.log` — saída 0, com aviso de tamanho do chunk legado.
- Bundle da API: `evidencias/v2-snapshot-api-build.log` — saída 0.
- Pacote/provas/hashes do snapshot final: `evidencias/v2-snapshot-conferencia.json` — envelope completo válido, nove inclusões, oito continuidades e todos os SHA-256 esperados preservados.
- Dados e quatro ícones: `evidencias/v2-snapshot-preservacao.json` — oito comparações byte a byte aprovadas.

Esse teste reutiliza dependências instaladas. Não comprova `npm ci`/pip em máquina limpa, ausência atual de vulnerabilidades, concorrência de múltiplos processos ou produção pública. O snapshot é uma pasta temporária comum, não um commit ou worktree Git. A revisão não executou staging, commit ou tag.

## Limites que acompanham qualquer tag

OTS continua sem confirmação Bitcoin e a âncora externa continua pendente. Base multiusuário permanece experimental local, sem declaração de proteção contra Sybil, prova universal de verdade, escala pública ou durabilidade conjunta de banco/objetos demonstrada sob queda de energia. Auditoria de dependências é o snapshot já documentado, com três altas e zero críticas naquela execução.

Todos os relatórios anteriores preservam seus respectivos snapshots de HEAD, contagem e horário; um commit futuro não muda retroativamente esses registros.
