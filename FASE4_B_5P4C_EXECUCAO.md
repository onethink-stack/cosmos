# 5p/4c — pacote de execução preparado; publicação pendente

## Inspeção desta retomada

O script `fase4-b-5p4c-compilar.ps1` informado na conversa **não existia neste checkout**. Foi criado agora e sua sintaxe PowerShell foi conferida sem executar compilação. Nenhum `cargo`, `rustc`, `naga`, linker ou contêiner disponível foi encontrado no PATH. A tentativa de listar distribuições WSL retornou ajuda/status 1; não demonstrou um Linux utilizável.

O script novo:

- confere HEAD da preparação e os três pins entrada/WGSL/Cargo.lock;
- desabilita instalação automática por rustup;
- confere Cargo/Rustc 1.99.1;
- só compila com `-ExecutarBuild`, usando `--release --locked --offline`;
- roda o teste Naga embutido em wgpu 30.0.1, sem depender de um `naga` CLI avulso de versão não definida;
- não instala toolchain, não executa GPU, não altera manifesto, não publica.

O teste Rust foi reforçado para exigir o `span == 616` da struct de entrada interpretada pelo Naga, além da validação do módulo e do workgroup. Essa fonte continua **não compilada** até a execução em toolchain adequada.

## Caminho remoto concreto proposto

Arquivo novo, somente local: `.github/workflows/fase4-b-5p4c-conferencia.yml`.

- Branch exclusiva proposta: `codex/fase4-b-5p4c`.
- Ubuntu 22.04, Node 22.14.0, Rust 1.99.1, wgpu 30.0.1, Cargo.lock já fixado.
- `contents: read`, checkout `persist-credentials: false`, nenhum secret de repo/provedor/carteira referenciado.
- Primeiro: testes Node e Carcara sintético real com o pin aprovado. Exige positivo `valid` status 0 e três mutantes `invalid` status 1 com diagnósticos específicos; timeout não aprova negativo.
- Depois: Naga em CPU Linux, build cruzado Windows GNU e manifesto com digest do executável realmente produzido, compilador, linker, lockfile e fontes.
- Nenhuma GPU executada no runner, nenhuma alegação de resultado físico.
- Nenhuma alteração nos workflows P1, CPU ou 4p/3c.

O conferidor `scripts/fase4-b-5p4c-carcara.mjs` é **exclusivamente sintético**. Não aceita um arquivo de testemunhos e o chama GPU, nem gera certificado GPU. Sua autorização não substitui o futuro ensaio físico.

## Restrição ainda vigente

O pacote anexado nesta conversa determina **“Sem: commit, push, merge, workflow remoto, deploy”**. Não há Rust local utilizável e a restrição anterior também veda instalação de toolchain nesta máquina. A solicitação geral de prosseguir não foi tratada como revogação silenciosa dessa proibição específica.

Foi apresentada ao operador uma pergunta explícita para autorizar **somente** o commit/push da seleção pública 5p/4c e seu workflow dedicado. Enquanto não houver resposta, não publicar nem executar Actions.

**Atualização de autorização:** o operador respondeu **“opção recomendada”** à pergunta que descrevia commit/push seletivo em branch dedicada e novo workflow Ubuntu 22.04/Node 22.14.0, sem secrets, merge ou deploy. Essa publicação específica está autorizada. A restrição de instalar ferramentas no Windows e a preservação dos artefatos anteriores continuam vigentes. O estado de preparação acima é histórico, não alegação de execução remota.

O inventário `FASE4_B_5P4C_PUBLICACAO.json` lista a seleção proposta. Ele é uma lista local de revisão, não prova de publicação ou aprovação. Não inclui arquivos privados nem os trabalhos locais preexistentes de especificação/ícones.

## Evidência local atual

- `evidencias/fase4-b-5p4c-validacao-local.json`: 20/20 Node selecionados, tipos novos/app/servidor aprovados, 13/13 pins e 23 arquivos 4p/3c preservados.
- `fase4-b-5p4c/manifesto.json`: pins novos de fontes e artefatos atualizados após acrescentar a asserção Naga. SMT2, entrada, WGSL, prova sintética e Cargo.lock preservados.
- HEAD `fde305b5106c23f0e4a24cb419ebb19371a89c2d`; índice vazio; nenhum commit/push/workflow/instalação nesta retomada.
- Build, Naga real, Carcara 5p/4c e GPU 5p/4c **não executados**. Não preencher SHA de executável/saída GPU ou run ID antecipadamente.
