# Selagem P1 Groq — preparação da CI, sem Fase 4

Branch solicitada: `codex/p1-groq-selada`, criada a partir de `2a4deec0df6635ff5ab4775b1ee7bab415962b39`, carregando o trabalho local aprovado. `COMMIT_P1_ARQUIVOS.json` seleciona explicitamente o P1 e suas dependências locais desde v2; não inclui privados, pastas de entregas, fase3-independente, tmp ou as alterações preexistentes em especificações/gerador antigo de ícones.

`CRITERIO.md` registra exclusivamente a prioridade **B (placa de vidro GPU com certificado conferido independente) → A (Carcara) → C (Alethe)**. Não foi iniciada nova implementação da Fase 4. Os wrappers e telas históricos já existentes são apenas dependências do estado P1.

## Conferência anterior e snapshot selecionado

- A implementação P1 foi validada em 995/995 testes, 65 arquivos, 270,20 s; typecheck e dois builds aprovados. Evidências anteriores `evidencias/p1-groq-*` permanecem com seus respectivos limites e horários.
- Para revisar o commit, o índice selecionado foi materializado em `tmp/p1-selada-snapshot`, com `git -c core.autocrlf=false checkout-index`. Dependências locais foram reutilizadas por junction; isso não é uma instalação limpa.
- A execução completa desse snapshot terminou **recusada**, com 915 aprovados, 80 não executados, seis arquivos com falha, 222,86 s. Fonte: `evidencias/p1-selagem-snapshot-ci.log`. Erros de inicialização `WebAssembly.Memory(): could not allocate memory` e erros secundários de cleanup com `api` não inicializado. Não se apresenta essa execução como verde.
- Memória virtual livre medida durante essa execução: 1.542.032 KiB; após ela: 1.932.444 KiB. Fontes `evidencias/p1-selagem-memoria-snapshot.json` e `evidencias/p1-selagem-memoria-apos-suite.json`. Compatível com pressão de memória, sem prova de causa única. Nenhum processo do usuário foi encerrado, nem Z3/seed/timeout/testes alterados.
- Typecheck e dois builds do snapshot foram conferidos separadamente e aprovados; logs `evidencias/p1-selagem-snapshot-typecheck.log` e `evidencias/p1-selagem-snapshot-build.log`. Aviso de chunk >500 KiB permanece.
- Preservação do snapshot compilado: **13/13**, `evidencias/p1-selagem-snapshot-preservacao.json`. O verificador recusou corretamente o relatório de testes incompleto; não basta declarar 995 no documento.

## Bytes e exclusões

`.gitattributes` fixa os arquivos cujos bytes são auditados: config.ts contém CRLF, enquanto os dois arquivos API/servidor v2 possuem terminadores mistos. O índice registra os mesmos bytes locais preservados pelas 13 comparações, sem conversão Git. Nos dois arquivos v2, a diferença para os blobs HEAD é exclusivamente terminador de linha, confirmada por comparação com CRLF convertido em LF; nenhuma lógica foi editada.

Os quatro JSONs históricos não entram como mudanças. O verificador público em `especificacao/provas-t1` e `especificacao/registros-v1` continua idêntico ao commit `17a016817c539658d4a92c01d8cb5284333ff115`; as alterações locais preexistentes nessa área ficam fora do commit. Textos de licença e logs são preservados, inclusive whitespace original e avisos. Não foi declarada aprovação de `git diff --check` sobre esses artefatos e CRLF deliberados.

## CI remota e identidade do verificador

O workflow `p1-groq-selada.yml` será disparado somente por push na branch P1. Executa instalação do lockfile em runners Windows e Linux, testes seriais com relatório JSON, typecheck, builds sem dotenv/injeção VITE, comparação 13/13 e congelamento do verificador público. Permissão somente `contents:read`; sem secrets, inferência Groq, publicação Pages, moeda ou deploy.

SHA-256 de `scripts/verificar-p1-selada.mjs`:

```text
f80b54678ec4da70f4257c42c2904eefc64b07f897c59d7f3cb070d27a496021
```

O run ID e a conclusão real da CI serão entregues após a execução remota. Não se reutiliza o ID histórico `39664843135` como prova do P1. O artefato de cada runner identifica o commit realmente executado e o hash do verificador. O CI histórico Fase 3/commit `502426c` permanece apenas como referência.

### Primeira CI remota — dependência de ambiente identificada

O run [40054367715](https://github.com/onethink-stack/cosmos/actions/runs/40054367715), commit `961661bdc62b57f65d6f640078c251e135d91f9c`, terminou com **993/995**, 64 arquivos aprovados e um com falha nos dois runners: Linux 118,02 s e Windows 141,38 s. As duas falhas são de `testes/regressao-ots.test.ts`, com `ModuleNotFoundError: No module named 'opentimestamps'`. Não é resultado verde.

A preparação do workflow foi corrigida para instalar Python 3.12 e as versões já fixadas em `scripts/requirements-ots.txt`, no destino `node_modules/.cosmos-ots-python` já usado pelo script histórico. A instalação ocorre depois de npm ci. Nenhum teste, produção OTS, timeout Z3 ou hash protegido foi alterado. Os testes executam somente `inspect` offline: isso não consulta calendários, não atualiza .ots e não confirma Bitcoin. A nova CI executará novamente a suíte inteira, sem filtrar falhas.

Publicação autorizada nesta etapa: exclusivamente a branch P1 para executar sua CI. Sem merge ou push em master/main/Fase 3, sem tag nova e sem deploy. Isso não resolve a confirmação Bitcoin do OTS nem cria âncora independente.
