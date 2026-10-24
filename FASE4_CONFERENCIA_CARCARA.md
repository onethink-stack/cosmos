# Conferência Carcara em Linux — procedimento preparado, não executado

## Estado e fronteira

Base local: `33e8c48e5e89b475c34c268a3ad7ea65f96c31f5`, branch `codex/fase4-carcara-alethe`. A referência CPU e seus artefatos ainda são alterações locais, não estão nesse commit. Um checkout desse HEAD no GitHub Actions **não contém a entrega CPU**. Um runner remoto dependerá de autorização posterior para publicar uma seleção revisada ou transferir os arquivos públicos explicitamente selecionados; não iniciar Actions agora.

Este documento não cria workflow nem modifica `.github/workflows/p1-groq-selada.yml`, o verificador P1 ou `CRITERIO.md`. A CI histórica `40090389127` permanece evidência do P1, não desta conferência. Não instalar Rust/WSL, compilar Carcara, ler credenciais, fazer commit/push/deploy ou chamar Groq como parte desta preparação.

**B GPU continua pendente.** Uma conferência positiva CPU não prova execução GPU nem conclui automaticamente os marcos históricos A/B/C.

## 1. Preparar Linux e origem confiável do checker

Usar ambiente Linux x86-64 descartável, sem secrets de repositório/provedor/carteira, com Node **22.14.0** e limite externo de duração do job. Registrar versão do sistema, arquitetura e runtime. A referência não precisa instalar dependências npm nem executar cvc5 novamente para conferir a prova existente.

Candidato inicial: release oficial **carcara-1.1.0**, asset `carcara-linux`:

- Release: https://github.com/ufmg-smite/carcara/releases/tag/carcara-1.1.0
- Asset: https://github.com/ufmg-smite/carcara/releases/download/carcara-1.1.0/carcara-linux

O nome do release não garante compatibilidade com a prova emitida por cvc5 1.4.2. Na consulta anterior, o asset não forneceu digest na API; **não há pin confiável Carcara aprovado nesta entrega**. Não inventar um SHA ou copiar o pin do cvc5/verificador P1. A assinatura exibida para o commit-fonte no GitHub não autentica automaticamente o executável anexado ao release.

Antes de executar, obter e registrar um SHA-256 esperado por canal confiável definido pelo operador, junto da origem e da versão do asset. Um hash calculado após baixar o mesmo arquivo registra seus bytes, mas sozinho não oferece confirmação independente de autenticidade. Se só houver confiança inicial no download HTTPS do projeto oficial, essa hipótese precisa ser explicitamente aceita e documentada; não chamá-la de assinatura do fabricante.

Baixar em etapa separada da execução, conferir o digest esperado **antes** de dar permissão de execução e registrar os metadados públicos. Não usar `curl | sh`, `latest`, instalação global, checksum escolhido pelo certificado ou pin extraído automaticamente do arquivo recém-baixado como se fosse previamente confiável.

Exemplo de conferência, somente quando o binário e o pin tiverem sido aprovados; variáveis abaixo não são credenciais:

```bash
set -euo pipefail
CARCARA_BIN='/caminho/absoluto/aprovado/carcara-linux'
CARCARA_SHA256='PREENCHER_COM_64_HEXADECIMAIS_CONFIAVEIS'
test -f "$CARCARA_BIN"
test ! -L "$CARCARA_BIN"
test "${#CARCARA_SHA256}" -eq 64
test "$(sha256sum -- "$CARCARA_BIN" | cut -d ' ' -f 1)" = "$CARCARA_SHA256"
chmod u+x -- "$CARCARA_BIN"
```

Não executar `--version` antes de conferir o pin. Se faltar biblioteca dinâmica ou houver incompatibilidade, registrar **indisponível**. Não instalar Rust nem trocar silenciosamente o checker/flags para obter verde.

## 2. Transferir somente a seleção pública revisada

Para um ambiente Linux separado, preparar seleção explícita, preservando bytes, sem arquivar o workspace inteiro:

- `scripts/fase4-referencia-cpu.mjs`;
- `src/fase4/referencia-cpu-node.ts`;
- `src/fase4/entrada-4-pombos-3-caixas.smt2`;
- `src/fase4/manifesto-cpu.json`;
- `evidencias/fase4-cpu-referencia/entrada.smt2`;
- `evidencias/fase4-cpu-referencia/proof.alethe`;
- `evidencias/fase4-cpu-referencia/cert.json`;
- inventário SHA-256 da seleção, emitido no ambiente local confiável e conferido no destino.

Manter a hierarquia de diretórios usada pelos imports. Nunca incluir `.env`, `privado/`, `.git`, cofres, chave Groq, seeds, `node_modules` ou arquivos de entrega históricos. Não converter LF/CRLF. Os artefatos públicos devem continuar com:

| Artefato | SHA-256 esperado |
| --- | --- |
| Entrada fixa | `5ead6b1b65836e0610ab91e657ad35b4c57122211f07126383ade24afd875edd` |
| Prova, 5357 bytes | `68c77a0feaaf9bc8ecb06a4b28b0bc8fca83225ce7f93c69fe5bff8b8e9db934` |
| Produtor Windows declarado no certificado | `868a0d7a5e3acba7d7e71b95c7a7f89fdc7b82d1ab8d2ea4a84ff067274bdf5a` |

O pin do produtor Windows serve para conferir a procedência declarada desta prova; não é um executável a rodar no Linux e não pode ser substituído pelo pin Carcara.

## 3. Conferir o caso positivo primeiro

No diretório da seleção pública, após conferir o binário e os arquivos, usar um diretório de trabalho novo. Sem download/instalação durante a checagem:

```bash
set -euo pipefail
node --experimental-strip-types scripts/fase4-referencia-cpu.mjs verificar \
  --pacote evidencias/fase4-cpu-referencia \
  --trabalho tmp/fase4-conferencia-carcara-1 \
  --cvc5-sha256 868a0d7a5e3acba7d7e71b95c7a7f89fdc7b82d1ab8d2ea4a84ff067274bdf5a \
  --carcara "$CARCARA_BIN" \
  --carcara-sha256 "$CARCARA_SHA256"
```

Criar previamente apenas o pai `tmp/`, se necessário; `fase4-conferencia-carcara-1` não pode existir. O adaptador exige diretórios absolutos internamente, resolve os argumentos da CLI, confere os hashes e copia os bytes para o trabalho novo. Executa o checker sem shell, com prazo de até 20 s e saída limitada a 1 MiB. O job externo também deve ter timeout; isso não transforma o adaptador em sandbox de sistema operacional.

**Aceitação positiva:** CLI sai 0, JSON tem `estado: "verificado-cpu"`, `gpu: "pendente"` e o SHA da prova esperado. Internamente, Carcara precisa sair 0 e stdout conter exclusivamente `valid`, além de whitespace nas extremidades. Somente código zero do wrapper, uma linha `valid` fabricada ou um hash correto não bastam como evidência do checker real.

Se falhar, interromper a homologação. Não iniciar negativos supondo que um checker incompatível os reprovou corretamente. Não permitir `holey`, regras desconhecidas, desativação da checagem de premissas ou ajustes de opções sem revisão. Preservar o erro para diagnóstico; compatibilidade com o release antigo é hipótese a testar.

## 4. Negativos reais, cada um em cópia nova

Não alterar a prova positiva, entrada confiável ou código do adaptador. Para cada caso, guardar cópia da prova, digest novo, certificado de teste com `provaSha256` recalculado e diretório de conferência exclusivo. Manter todos os outros metadados aprovados. Regravar o certificado com `JSON.stringify(c, null, 2) + '\n'`, preservando a ordem original das chaves, porque o formato local exige essa serialização exata; isso não é JCS.

| Caso | Mutação controlada | Evidência necessária |
| --- | --- | --- |
| Byte adulterado, hash antigo | Alterar um byte da prova sem mudar certificado | Recusa de vínculo antes de executar checker; testa integridade, não semântica. |
| Prova truncada, hash recalculado | Remover fechamento/trecho final da cópia | Confirmar passagem pela validação de hashes e recusa do Carcara real. Erro de parsing comprova detecção estrutural, não uma inferência inválida. |
| Passo logicamente inválido, hash recalculado | Alterar uma conclusão/intermediário preservando gramática, identificadores e referências | Diagnóstico real do checker sobre o passo; erro de sintaxe ou identificador inexistente não substitui este teste semântico. A mutação concreta deve ser registrada e revisada. |
| Premissa fora do problema, hash recalculado | Substituir uma fórmula de `assume` por fórmula bem formada ausente da entrada, preservando id e aliases necessários | Diagnóstico real de premissa não autorizada; nunca modificar o problema original para acomodar a premissa. Registrar transformação concreta, sem inventar regra Alethe. |

Não tratar qualquer saída 2 como detecção semântica: o adaptador atual pode classificar checker não zero, erro de execução e timeout como `indisponivel`. Para distinguir as causas, conservar também stdout, stderr e exit status da execução direta do **mesmo binário pinado** sobre os mesmos bytes, com timeout externo de 20 s, arquivos/saída limitados, sem rede e sem secrets no ambiente. As flags devem ser idênticas: `--no-color check PROVA PROBLEMA`. Esse diagnóstico complementa o adaptador; não concede aprovação alternativa.

Falha de transporte, biblioteca ausente, timeout, checker inexistente, status 137 ou falta de memória **não contam** como negativo semântico aprovado. Um negativo aceito pelo checker bloqueia a entrega. Os 40 testes atuais com mocks continuam evidência do tratamento de fronteira, não destes negativos reais.

## 5. Preservação e recibo de execução

No workspace completo, comparar os 13 pins de `evidencias/p1-groq-sha256-esperados.json` antes/depois. Numa seleção Linux reduzida, registrar **não aferido nesse ambiente** para arquivos não transferidos; não alegar 13/13 a partir apenas dos três artefatos. Comparar a seleção transferida no destino e reconferir os 13/13 no workspace de origem.

Guardar recibo público em `evidencias/`, com: inventário das fontes e artefatos, sistema/arquitetura, Node, origem/versão/pin do Carcara, comandos efetivos, duração, status do processo, resultados positivo/negativos, distinção de diagnóstico sintático/semântico e limites. O recibo não deve conter dump de ambiente, credenciais ou paths privados. Timestamp do runner não é OTS nem carimbo autenticado Bitcoin.

Se houver GitHub Actions posteriormente autorizado, usar workflow **novo e separado**, Linux fixado, permissão `contents: read`, credenciais de checkout não persistidas, sem secrets/deploy e com artefatos públicos explicitamente enumerados. Não alterar/reexecutar a CI P1 para atribuir-lhe novos resultados. Registrar novo commit/run ID somente após execução real. No estado atual, sem commit/push, nenhum run desse procedimento existe.

## Critério de encerramento

Preparação documental: concluída quando este procedimento estiver revisado. Conferência formal CPU: permanece **pendente** até positivo e negativos reais comprovados com checker pinado. A matriz Windows/Linux e qualquer aprovação adicional do marco A exigem evidências próprias; um resultado Linux isolado não certifica ambos os sistemas. **B GPU permanece pendente em todos os casos.**
