# B GPU — protocolo híbrido aprovado, execução pendente

## Decisão do operador

O operador aprovou nesta conversa: **“GPU gera testemunhos; CPU serializa Alethe”**. A CPU não pode executar outro solver para substituir os resultados da GPU. O Carcara real permanece responsável por conferir a prova contra o problema original.

Essa decisão define a divisão do trabalho. Não declara um kernel implementado, pinado ou executado. Não amplia a autorização anterior de publicação da seleção CPU para publicar automaticamente código GPU, instalar Rust, criar outro runner ou fazer deploy.

Base de referência: commit `c64457f91e9e00ff82b68afc5f3a768a9171c98b`, CI CPU Linux `40118753348`. `CRITERIO.md` e a referência CPU publicada permanecem históricos, sem reinterpretação.

## B1. Problema e representação exatos

- Ler os mesmos bytes UTF-8 de `src/fase4/entrada-4-pombos-3-caixas.smt2`, SHA-256 `5ead6b1b65836e0610ab91e657ad35b4c57122211f07126383ade24afd875edd`.
- Fragmento aceito nesta versão: somente a instância booleana fixa, com 12 variáveis e 34 cláusulas. Não é um solver SMT geral, não trabalha com números de ponto flutuante ou aritmética em ℚ(√2).
- Variável `pPhH` corresponde ao bit `3*P + H`, com `0 <= P < 4` e `0 <= H < 3`. A atribuição `a` é o inteiro de 0 a 4095; bit 1 representa verdadeiro.
- Preservar a ordem das 34 cláusulas no SMT2. Tradutor fechado deve conferir a entrada inteira e recusar fórmulas/declarações inesperadas, não extrair silenciosamente apenas as linhas que reconhecer.
- Cada cláusula é um par `(positivos, negativos)` de máscaras `u32`, usando apenas os 12 bits inferiores. Máscaras conflitantes ou fora do domínio são recusadas.
- Buffer de entrada proposto: quatro `u32` little-endian `[versao=1, variaveis=12, clausulas=34, atribuicoes=4096]`, seguidos dos 34 pares de máscaras na ordem original. Tamanho exato: **288 bytes**. O hash desse buffer será calculado quando a tradução for implementada, não inventado agora.
- O host conserva o vínculo entre SHA do SMT2, versão do tradutor, hash do buffer e bytes enviados ao dispositivo. O verificador reconstitui a mesma representação a partir do SMT2 confiável.

## B2. Trabalho exclusivo da GPU

Kernel WGSL, executado por host **wgpu** nativo a definir/pinar antes de executar. Não chamar execução WASM CPU de GPU e não substituir wgpu nativo por outro runtime sem registrar a decisão.

Para cada `a` de 0 a 4095, uma invocação procura a primeira cláusula falsa na ordem fixada. Uma cláusula é satisfeita quando:

```text
(a & positivos) != 0 OR ((~a) & negativos & 0xFFF) != 0
```

A GPU escreve o índice dessa cláusula no slot `saida[a]`. Se todas forem satisfeitas, escreve `0xFFFFFFFF`, testemunho de atribuição satisfatória. Para a instância fixa UNSAT, esse sentinela deve ser recusado como divergência; não converter silenciosamente para UNSAT.

- Somente operações inteiras `u32`, sem float, aleatoriedade, relógio, rede ou redução com ordem variável.
- Cada invocação escreve apenas seu próprio slot; resultado não depende da ordem de escalonamento das invocações.
- Buffer de saída: exatamente 4096 `u32`, **16384 bytes**, serializados little-endian; slot identifica implicitamente a atribuição.
- Inicializar com `0xFFFFFFFE`, distinto do sentinela SAT. Slot não escrito ou índice fora de 0–33 invalida a execução.
- Um workgroup de 64 invocações e 64 grupos cobre a instância. Conferir os limites reais do dispositivo antes de usar esses parâmetros; indisponibilidade deve encerrar sem aprovação.

## B3. Ponte CPU → Alethe

O host valida formato, tamanho e índices e verifica que a cláusula indicada é realmente falsa para a atribuição daquele slot. Essa conferência de testemunhos é admitida: não é execução de outro solver. Testemunho inválido interrompe a conversão; não procurar uma cláusula alternativa na CPU para “consertar” a saída da GPU.

O conversor deve consumir **os testemunhos retornados pela GPU**, com hash explícito da saída consumida. Não pode retornar a prova cvc5 já existente, chamar Z3/cvc5 ou aprovar UNSAT a partir de um contador desacompanhado de prova.

Construção proposta para prototipar antes do kernel:

1. Introduzir as cláusulas do problema como premissas autorizadas, preservando a ligação ao SMT2 original.
2. Para cada ramo necessário da árvore de atribuições, usar a cláusula falsa indicada e as hipóteses locais do ramo para obter a contradição.
3. Descarregar hipóteses por subprovas Alethe e combinar os ramos por resolução até a cláusula vazia.
4. Compartilhar/comprimir ramos apenas quando a mesma cláusula fornecida nos testemunhos já é falsa sob o prefixo de atribuição, com esse fato conferido. Não usar compressão que descarte cobertura de atribuições.

**Essa construção ainda não foi homologada no Carcara.** Os arquivos históricos locais contêm exemplos de `anchor`, `subproof` e `:discharge`, mas isso não comprova esta nova tradução. O primeiro protótipo deve demonstrar as regras, escopos e descargas com casos pequenos e depois com a instância fixa, no mesmo checker, sem `ignore-unknown-rules` ou aprovação de `holey`.

O limite atual de prova do adaptador CPU permanece **1 MiB** e o prazo **20 s**. A árvore expandida ingenuamente pode exceder o limite; medir o protótipo e otimizar a representação antes de prosseguir. Não aumentar limites automaticamente para obter aprovação. Se a construção não couber ou não passar no Carcara, B permanece inconclusivo e o desenho precisa de revisão.

## B4. Evidência e pins

Criar formato próprio `cosmos-b-gpu-cert-v1`; não reescrever certificados da cadeia pessoal ou da referência CPU. O certificado deverá vincular:

- hash do SMT2 original e do buffer de entrada;
- versão e hash do tradutor;
- conteúdo/hash exatos do WGSL enviado ao driver, entrypoint e parâmetros de dispatch;
- versão/revisão de wgpu, lockfile, toolchain, backend e hash do executável host efetivamente usado;
- bytes e hash da saída GPU, com quantidade esperada de slots;
- versão/hash do conversor e da prova Alethe derivada;
- pin e veredito do Carcara real;
- informações operacionais do adaptador/dispositivo e relatório de execução, com tempo declarado, não autenticado.

Os pins do kernel, host, tradutor e conversor ficam **null/pendentes** no manifesto de planejamento, porque não existem artefatos implementados aprovados ainda. Depois de implementados e revisados, calcular hashes reais e congelar o manifesto antes do ensaio. Hash do WGSL identifica o código-fonte enviado; não atesta o binário interno gerado pelo driver nem a correção física do hardware.

Carcara já aprovado para conferência CPU Linux:

```text
release: carcara-1.1.0
sha256: fcd06852931d36b13e6d3f7965c81a068f5cfe2f3c5e7da2d91af500f8f1bfda
```

A hipótese de confiança inicial HTTPS e seus limites continuam os mesmos. A validade da prova não depende de confiar na saída da GPU. Ela também não constitui atestação criptográfica de que determinada GPU produziu os bytes.

## B5. Dispositivo e disponibilidade

Consulta local somente de inventário retornou **AMD Radeon(TM) Vega 8 Graphics**, driver **31.0.21024.7004**, `AdapterRAM=1073741824`. Essa propriedade de inventário não mede memória utilizável pelo wgpu nem comprova suporte a compute.

Antes da execução real, o host deve obter adaptador/dispositivo, registrar backend e tipo e recusar adaptador CPU/software. Pedir `force_fallback_adapter=false` sozinho não é prova de GPU física. Registrar criação do pipeline, dispatch, sincronização/readback e erros do dispositivo. Fallback ou perda do dispositivo devem retornar `indisponivel`, sem repetir automaticamente na CPU e manter o rótulo GPU.

O runner Ubuntu usado no marco CPU não demonstrou GPU disponível. Seu papel pode ser conferir a prova produzida em outro dispositivo e os negativos; isso não o transforma em runner GPU. Execução real na máquina local e conferência Linux são evidências distintas e devem ser vinculadas pelos mesmos hashes públicos.

## B6. Casos mínimos de validação

| Caso | Resultado exigido |
| --- | --- |
| Saída GPU válida da instância fixa | Ponte produz Alethe e Carcara real retorna `valid`. |
| Slot não escrito, faltante ou buffer curto/excedente | Recusa anterior à emissão de prova. |
| Índice negativo representado como u32, >=34 ou sentinela SAT | Recusa/detecção explícita, não UNSAT aprovado. |
| Cláusula indicada é verdadeira naquela atribuição | Recusa, sem reparo na CPU. |
| Buffer de entrada/SMT2/kernel/saída/prova alterados | Recusa de vínculo, inclusive quando o certificado tenta apontar a outra entrada. |
| Saída adulterada e hashes recalculados | Verificação dos testemunhos e/ou Carcara detectam inconsistência; hash sozinho não basta. |
| Prova truncada, passo errado e premissa externa, hashes recalculados | Negativos reais no Carcara, distinguindo parser e semântica. |
| Adaptador software, GPU ausente, perda de dispositivo ou timeout | Indisponível/inconclusivo; sem aprovação nem substituição oculta por CPU. |
| Repetições da execução na configuração pinada | Saída GPU determinística comparada byte a byte; divergência investigada. |

Testes da ponte podem usar testemunhos sintéticos identificados como tais, mas nunca contam como execução GPU. Uma referência CPU lexical/booleana pode servir como oráculo de teste, separada do caminho de produção e sem substituir dados GPU no certificado final.

## Sequência de implementação proposta

1. Prototipar e conferir a tradução testemunhos → Alethe, sem GPU e explicitamente como teste da ponte.
2. Fechar tradução SMT2 → buffer e contrato de testemunhos, com testes negativos e limites.
3. Escolher/pinar versões reais de host wgpu/toolchain e revisar a necessidade de ferramentas; não instalar Rust automaticamente sob a restrição atual.
4. Implementar WGSL e host, calcular pins reais, testar disponibilidade da Vega 8 sem fallback software.
5. Rodar GPU, emitir certificado/prova derivados e conferir com Carcara Linux independente, vinculando a saída consumida pelo conversor.
6. Guardar recibos, executar regressão adequada e conferir os 13 pins históricos. Novas publicações exigem escopo autorizado para B.

## Preservação e precisão do marco anterior

`config.ts`, dados v1, chaves, moeda, verificador P1 e `CRITERIO.md` não são alvos desta proposta. Nenhuma fase F0–F8 é renomeada ou reinterpretada. Nenhum segredo, carteira, mint, rede pública, OTS ou âncora faz parte de B.

Na extração CPU já conferida, os bytes removidos foram prefixo **`280d0a`** e sufixo **`290d0a`**, preservando CRLF; não `0a28/290a`. A reconstrução byte a byte está registrada em `evidencias/fase4-carcara-revisao-final.json`.

**Estado final deste documento: arquitetura híbrida aprovada; ponte Alethe, kernel, host e execução GPU pendentes. B GPU não está concluído.**

## Autorização ampla e protótipo posterior

O operador aprovou expressamente as dez etapas seguintes, incluindo Rust/wgpu, Cargo.lock, execução física e publicação do workflow B separado; registro em `FASE4_B_AUTORIZACAO.md`. Trabalho isolado em `codex/fase4-b-gpu`, sem avançar a branch CPU congelada.

O protótipo da ponte usa resolução diretamente sobre cláusulas indicadas pelos testemunhos, sem precisar de `subproof`: uma cláusula que já é falsa no prefixo pode ser folha; duas conclusões com pivôs opostos são resolvidas; se uma conclusão já independe do pivô, ela pode ser conservada como conclusão mais forte. Todos os 4096 testemunhos são validados antes de construir a prova, inclusive os que não sejam necessários à refutação mínima. Nenhum testemunho inválido é reparado.

Oito testes locais passaram. A instância sintética gera 7881 bytes, 48 resoluções e buffer SHA-256 `b4dc6d8a68cb5190f49def3ffaa82e44a29c63ab7803313c87792ede8da664c3`. Isso é medição local do protótipo, não veredito formal nem execução GPU. A conferência Carcara é a próxima barreira antes de compilar o host.

Versões reais consultadas em fontes oficiais: Rust stable 1.99.1 (`58cf8f9c3`, 2026-10-13), wgpu 30.0.1 (crate SHA `527ccdf43dd5b2e8676eed9984ce00e2bbb0a1b85b70c1969dcb6cd2eb55ab9e`), serde_json 1.0.154. O host proposto compila para Windows GNU no runner Linux descartável e usa somente Vulkan, cujo loader está presente localmente. Presença do loader ainda não demonstra criação de dispositivo ou execução.
