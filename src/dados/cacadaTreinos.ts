// Casos reais para treinar a caçada: ataques públicos a pontes entre redes,
// modelados de forma simplificada a partir do que os relatórios públicos
// descrevem. Em cada um, o motor acha o cenário da falha com as regras de
// antes; com a correção, a promessa passa a valer (e o Z3 prova).

export interface RegraTreino {
  id: string
  titulo: string
  formula: string
  /** onde isso está no código (como os relatórios contam) */
  fonte: string
}

export interface CasoTreino {
  id: string
  nome: string
  quando: string
  /** o que aconteceu, em uma frase */
  resumo: string
  regras: RegraTreino[]
  promessa: { titulo: string; citacao: string; formula: string }
  /** a regra que o código deveria ter (e `substitui`, a regra com o defeito, se houver) */
  correcao: RegraTreino & { substitui?: string; explicacao: string }
}

export const TREINOS: CasoTreino[] = [
  {
    id: 'nomad',
    nome: 'Nomad: a raiz zero aceita',
    quando: 'agosto de 2022 (cerca de US$ 190 milhões)',
    resumo:
      'Uma atualização iniciou o contrato com a raiz zero marcada como confirmada; como toda mensagem nunca provada fica com a raiz zero, qualquer pessoa pôde fazer o contrato processar mensagens inventadas.',
    regras: [
      { id: 'n1', titulo: 'Mensagens e raízes são coisas diferentes', formula: '∀x ¬(Mensagem(x) ∧ Raiz(x))', fonte: 'modelo (separa os dois tipos)' },
      { id: 'n2', titulo: 'Cada mensagem tem a raiz registrada para ela', formula: '∀m (Mensagem(m) ⟹ Raiz(raiz(m)))', fonte: 'Replica: messages[hash]' },
      {
        id: 'n3',
        titulo: 'Mensagem nunca provada fica com a raiz zero (o valor vazio do mapa)',
        formula: '∀m (Mensagem(m) ∧ ¬Provada(m) ⟹ raiz(m) = zero)',
        fonte: 'Replica: messages[hash] vazio = 0x00',
      },
      {
        id: 'n4',
        titulo: 'O contrato processa a mensagem se a raiz dela é aceitável',
        formula: '∀m (Mensagem(m) ⟹ (Processa(m) ⟺ Aceitavel(raiz(m))))',
        fonte: 'Replica.process → acceptableRoot(messages[hash])',
      },
      {
        id: 'n5',
        titulo: 'Uma raiz é aceitável se foi confirmada',
        formula: '∀r (Raiz(r) ⟹ (Aceitavel(r) ⟺ Confirmada(r)))',
        fonte: 'Replica.acceptableRoot → confirmAt[root]',
      },
      { id: 'n6', titulo: 'Zero também é uma raiz', formula: 'Raiz(zero)', fonte: 'bytes32(0)' },
      {
        id: 'n7',
        titulo: 'A atualização iniciou o contrato com a raiz zero confirmada',
        formula: 'Confirmada(zero)',
        fonte: 'Replica.initialize(_committedRoot = 0x00) → confirmAt[0x00] = 1',
      },
    ],
    promessa: {
      titulo: 'Só mensagem provada é processada',
      citacao: 'Uma mensagem só é processada depois de provada contra uma raiz confirmada.',
      formula: '∀m (Mensagem(m) ∧ Processa(m) ⟹ Provada(m))',
    },
    correcao: {
      id: 'n7b',
      titulo: 'A raiz zero nunca é confirmada',
      formula: '¬Confirmada(zero)',
      fonte: 'initialize recusa a raiz 0x00',
      substitui: 'n7',
      explicacao: 'Troque a regra da atualização pela que o código deveria garantir: a raiz zero nunca vale como confirmada.',
    },
  },
  {
    id: 'qubit',
    nome: 'Qubit: depósito sem dinheiro',
    quando: 'janeiro de 2022 (cerca de US$ 80 milhões)',
    resumo:
      'O depósito comum aceitava o endereço zero (o do ETH) como token; a chamada de transferência para um endereço sem código não falha, então o depósito era registrado sem nenhum dinheiro entrar, e os tokens eram criados na outra rede.',
    regras: [
      { id: 'q1', titulo: 'Depósitos e tokens são coisas diferentes', formula: '∀x ¬(Deposito(x) ∧ Token(x))', fonte: 'modelo (separa os dois tipos)' },
      { id: 'q2', titulo: 'Todo depósito indica o endereço de um token', formula: '∀d (Deposito(d) ⟹ Token(token(d)))', fonte: 'QBridge.deposit(resourceID) → tokenAddress' },
      {
        id: 'q3',
        titulo: 'O depósito é registrado se a chamada de transferência não reverte',
        formula: '∀d (Deposito(d) ⟹ (Registrado(d) ⟺ ChamadaOk(token(d))))',
        fonte: 'QBridgeHandler.deposit → tokenAddress.safeTransferFrom(...)',
      },
      {
        id: 'q4',
        titulo: 'Chamada a um endereço sem código não reverte (a rede devolve sucesso)',
        formula: '∀t (Token(t) ∧ SemCodigo(t) ⟹ ChamadaOk(t))',
        fonte: 'EVM: CALL para conta sem código',
      },
      {
        id: 'q5',
        titulo: 'Endereço sem código não transfere nada',
        formula: '∀d (Deposito(d) ∧ SemCodigo(token(d)) ⟹ ¬Recebeu(d))',
        fonte: 'EVM',
      },
      {
        id: 'q6',
        titulo: 'Num token de verdade, a transferência que não reverte entrega os fundos',
        formula: '∀d (Deposito(d) ∧ ChamadaOk(token(d)) ∧ ¬SemCodigo(token(d)) ⟹ Recebeu(d))',
        fonte: 'ERC-20',
      },
      {
        id: 'q7',
        titulo: 'O ETH usa o endereço zero, que não tem código',
        formula: 'Token(zero) ∧ SemCodigo(zero)',
        fonte: 'resourceID do ETH → tokenAddress = address(0)',
      },
    ],
    promessa: {
      titulo: 'Todo depósito registrado recebeu os fundos',
      citacao: 'Os tokens só são criados na outra rede para depósitos pagos.',
      formula: '∀d (Deposito(d) ∧ Registrado(d) ⟹ Recebeu(d))',
    },
    correcao: {
      id: 'q8',
      titulo: 'Só registra depósito de token que tem código',
      formula: '∀d (Deposito(d) ∧ Registrado(d) ⟹ ¬SemCodigo(token(d)))',
      fonte: 'deposit recusa tokenAddress sem código (o ETH vai por depositETH)',
      explicacao: 'Acrescente a regra que faltava: o depósito comum recusa endereço sem código.',
    },
  },
  {
    id: 'wormhole',
    nome: 'Wormhole: a conta de instruções falsa',
    quando: 'fevereiro de 2022 (cerca de US$ 320 milhões)',
    resumo:
      'A verificação das assinaturas lia a conta de instruções que quem chamava informava, sem conferir se era a conta oficial do sistema; uma conta falsa "dizia" que as assinaturas tinham sido conferidas.',
    regras: [
      { id: 'w1', titulo: 'Conjuntos de assinaturas e contas são coisas diferentes', formula: '∀x ¬(Conjunto(x) ∧ Conta(x))', fonte: 'modelo (separa os dois tipos)' },
      {
        id: 'w2',
        titulo: 'Cada conjunto de assinaturas lê a conta de instruções que quem chama informou',
        formula: '∀s (Conjunto(s) ⟹ Conta(conta(s)))',
        fonte: 'verify_signatures: a conta de instruções vem na transação',
      },
      {
        id: 'w3',
        titulo: 'O conjunto vira válido se essa conta diz que as assinaturas foram conferidas',
        formula: '∀s (Conjunto(s) ⟹ (Valido(s) ⟺ DizQueConferiu(conta(s))))',
        fonte: 'load_instruction_at lê a instrução secp256k1 da conta',
      },
      {
        id: 'w4',
        titulo: 'Só a conta oficial do sistema diz a verdade',
        formula: '∀c (Conta(c) ∧ Oficial(c) ⟹ (DizQueConferiu(c) ⟺ Conferiu(c)))',
        fonte: 'a conta de instruções do sistema (sysvar) do Solana',
      },
    ],
    promessa: {
      titulo: 'Todo conjunto válido teve as assinaturas conferidas',
      citacao: 'Uma mensagem só vale com as assinaturas dos guardiões conferidas.',
      formula: '∀s (Conjunto(s) ∧ Valido(s) ⟹ Conferiu(conta(s)))',
    },
    correcao: {
      id: 'w5',
      titulo: 'Só aceita a conta oficial do sistema',
      formula: '∀s (Conjunto(s) ⟹ Oficial(conta(s)))',
      fonte: 'load_instruction_at_checked confere o endereço da conta',
      explicacao: 'Acrescente a regra que faltava: a conta lida tem de ser a oficial.',
    },
  },
  {
    id: 'poly',
    nome: 'Poly Network: o gerente que troca os guardiões',
    quando: 'agosto de 2021 (cerca de US$ 610 milhões, quase tudo devolvido)',
    resumo:
      'O contrato gerente executava mensagens chamando qualquer contrato indicado nelas, e era o dono do contrato que guarda os guardiões; uma mensagem apontando esse contrato trocou os guardiões pelos do atacante.',
    regras: [
      { id: 'p1', titulo: 'Mensagens e contratos são coisas diferentes', formula: '∀x ¬(Mensagem(x) ∧ Contrato(x))', fonte: 'modelo (separa os dois tipos)' },
      {
        id: 'p2',
        titulo: 'Toda mensagem indica o contrato de destino',
        formula: '∀m (Mensagem(m) ⟹ Contrato(alvo(m)))',
        fonte: 'EthCrossChainManager: toContract vem na mensagem',
      },
      {
        id: 'p3',
        titulo: 'O gerente só chama um contrato ao executar uma mensagem que o indica',
        formula: '∀c (Chama(gerente, c) ⟹ ∃m (Mensagem(m) ∧ Executada(m) ∧ alvo(m) = c))',
        fonte: 'EthCrossChainManager._executeCrossChainTx',
      },
      {
        id: 'p4',
        titulo: 'Troca os guardiões: um guardião (caminho oficial), ou o dono do contrato de dados chamando-o',
        formula: '∀x (PodeTrocar(x) ⟺ (Guardiao(x) ∨ (Chama(x, dados) ∧ Dono(x, dados))))',
        fonte: 'EthCrossChainData.putCurEpochConPubKeyBytes (onlyOwner)',
      },
      { id: 'p5', titulo: 'O gerente é o dono do contrato de dados', formula: 'Dono(gerente, dados)', fonte: 'EthCrossChainData.owner' },
      { id: 'p6', titulo: 'Só o gerente é dono do contrato de dados', formula: '∀x (Dono(x, dados) ⟹ x = gerente)', fonte: 'Ownable: um dono só' },
      { id: 'p7', titulo: 'O contrato de dados é um contrato', formula: 'Contrato(dados)', fonte: 'EthCrossChainData' },
      { id: 'p8', titulo: 'O gerente não é guardião', formula: '¬Guardiao(gerente)', fonte: 'os guardiões são as chaves da rede Poly' },
    ],
    promessa: {
      titulo: 'Só guardiões trocam os guardiões',
      citacao: 'Os guardiões só mudam pelo consenso da rede.',
      formula: '∀x (PodeTrocar(x) ⟹ Guardiao(x))',
    },
    correcao: {
      id: 'p9',
      titulo: 'Nenhuma mensagem pode ter o contrato de dados como destino',
      formula: '∀m (Mensagem(m) ⟹ alvo(m) ≠ dados)',
      fonte: '_executeCrossChainTx recusa toContract = EthCrossChainData',
      explicacao: 'Acrescente a regra que faltava: o gerente nunca executa uma mensagem dirigida ao contrato de dados.',
    },
  },
]

/** Um alvo pronto para começar: regras tiradas do código público, e promessas para conferir. */
export interface ModeloInicial {
  id: string
  nome: string
  programa: string
  escopo: string
  /** o que é este rascunho e o que esperar dele */
  nota: string
  regras: RegraTreino[]
  promessas: { id: string; titulo: string; citacao: string; formula: string; fonte: string }[]
}

const MC = 'MessagingChannel.sol (LayerZero-v2, commit 9c741e7)'
const EP = 'EndpointV2.sol (LayerZero-v2, commit 9c741e7)'

export const MODELOS: ModeloInicial[] = [
  {
    id: 'layerzero-recebimento',
    nome: 'LayerZero EndpointV2 — recebimento (rascunho)',
    programa: 'https://immunefi.com/bug-bounty/layerzero/information/',
    escopo:
      'Um caminho (destinatário, rede de origem, remetente), um passo: o estado antes (slotA, lazyA), uma operação no nonce nn, e o estado depois (slotD, lazyD). Fora do modelo: _initializable (supõe o caminho já iniciado), quem pode chamar cada função e o que o destinatário faz ao receber. O programa exige teste em código em qualquer gravidade, recusa o que já está nas auditorias publicadas, trata impactos de OFT/ONFT como baixos e proíbe testar na rede principal e nas redes de teste públicas; pede KYC.',
    nota:
      'Rascunho tirado do código público. As promessas que valem mostram as checagens em que a garantia se apoia (é nelas que se procura um caminho que escape). A última fura de propósito: as mensagens são liberadas em ordem (uma lacuna trava as seguintes até o app pular, anular ou queimar), o que o próprio código documenta — uma pista para descartar, não uma falha.',
    regras: [
      {
        id: 'lz-tipos',
        titulo: 'Tipos: nonces e hashes; vazio (0) e nulo (2²⁵⁶−1) são hashes especiais',
        formula:
          '(∀x ¬(Nonce(x) ∧ Hash(x))) ∧ Hash(vazio) ∧ Hash(nulo) ∧ vazio ≠ nulo ∧ Nonce(nn) ∧ Hash(hh) ∧ Nonce(lazyA) ∧ Nonce(lazyD) ∧ ∀n (Nonce(n) ⟹ Hash(slotA(n)) ∧ Hash(slotD(n)))',
        fonte: `${MC}: EMPTY_PAYLOAD_HASH, NIL_PAYLOAD_HASH, inboundPayloadHash, lazyInboundNonce`,
      },
      {
        id: 'lz-ordem',
        titulo: 'Os nonces são ordenados',
        formula: '(∀x ¬Menor(x, x)) ∧ (∀x ∀y ∀z (Menor(x, y) ∧ Menor(y, z) ⟹ Menor(x, z))) ∧ ∀x ∀y (Nonce(x) ∧ Nonce(y) ⟹ Menor(x, y) ∨ x = y ∨ Menor(y, x))',
        fonte: 'uint64',
      },
      {
        id: 'lz-operacao',
        titulo: 'Acontece uma operação, no nonce nn',
        formula:
          '(Verifica(nn) ∨ Executa(nn) ∨ Pula(nn) ∨ Anula(nn) ∨ Queima(nn)) ∧ ¬(Verifica(nn) ∧ Executa(nn)) ∧ ¬(Verifica(nn) ∧ Pula(nn)) ∧ ¬(Verifica(nn) ∧ Anula(nn)) ∧ ¬(Verifica(nn) ∧ Queima(nn)) ∧ ¬(Executa(nn) ∧ Pula(nn)) ∧ ¬(Executa(nn) ∧ Anula(nn)) ∧ ¬(Executa(nn) ∧ Queima(nn)) ∧ ¬(Pula(nn) ∧ Anula(nn)) ∧ ¬(Pula(nn) ∧ Queima(nn)) ∧ ¬(Anula(nn) ∧ Queima(nn))',
        fonte: 'verify, lzReceive/clear, skip, nilify, burn',
      },
      {
        id: 'lz-resto',
        titulo: 'Os outros nonces não mudam',
        formula: '∀i (Nonce(i) ∧ i ≠ nn ⟹ slotD(i) = slotA(i))',
        fonte: 'cada função escreve só inboundPayloadHash[…][_nonce]',
      },
      {
        id: 'lz-verify',
        titulo: 'verify: hash não vazio; nonce à frente do lazy, ou ainda não executado',
        formula: 'Verifica(nn) ⟹ hh ≠ vazio ∧ (Menor(lazyA, nn) ∨ slotA(nn) ≠ vazio) ∧ slotD(nn) = hh ∧ lazyD = lazyA',
        fonte: `${EP}: verify → _verifiable; ${MC}: _inbound`,
      },
      {
        id: 'lz-hash',
        titulo: 'O hash de um conteúdo nunca é 0 nem 2²⁵⁶−1 (hipótese do código)',
        formula: 'Executa(nn) ⟹ hh ≠ vazio ∧ hh ≠ nulo',
        fonte: `${MC}: comentários de _hasPayloadHash e nilify (inviável achar esses hashes)`,
      },
      {
        id: 'lz-receber',
        titulo: 'lzReceive / clear: o hash confere, sem lacuna até nn; apaga e avança o lazy',
        formula:
          'Executa(nn) ⟹ slotA(nn) = hh ∧ ∀i (Nonce(i) ∧ Menor(lazyA, i) ∧ ¬Menor(nn, i) ⟹ slotA(i) ≠ vazio) ∧ slotD(nn) = vazio ∧ (Menor(lazyA, nn) ⟹ lazyD = nn) ∧ (¬Menor(lazyA, nn) ⟹ lazyD = lazyA)',
        fonte: `${MC}: _clearPayload`,
      },
      {
        id: 'lz-skip',
        titulo: 'skip: só o primeiro nonce depois da sequência sem lacunas; o lazy vai até ele',
        formula:
          'Pula(nn) ⟹ Menor(lazyA, nn) ∧ ∀i (Nonce(i) ∧ Menor(lazyA, i) ∧ Menor(i, nn) ⟹ slotA(i) ≠ vazio) ∧ slotA(nn) = vazio ∧ lazyD = nn ∧ slotD(nn) = slotA(nn)',
        fonte: `${MC}: skip (_nonce == inboundNonce + 1)`,
      },
      {
        id: 'lz-nilify',
        titulo: 'nilify: o hash confere; não vale em nonce já encerrado; marca nulo',
        formula: 'Anula(nn) ⟹ slotA(nn) = hh ∧ (Menor(lazyA, nn) ∨ hh ≠ vazio) ∧ slotD(nn) = nulo ∧ lazyD = lazyA',
        fonte: `${MC}: nilify`,
      },
      {
        id: 'lz-burn',
        titulo: 'burn: o hash confere e não é vazio; só até o lazy; apaga',
        formula: 'Queima(nn) ⟹ slotA(nn) = hh ∧ hh ≠ vazio ∧ ¬Menor(lazyA, nn) ∧ slotD(nn) = vazio ∧ lazyD = lazyA',
        fonte: `${MC}: burn`,
      },
    ],
    promessas: [
      {
        id: 'lz-uma-vez',
        titulo: 'Uma mensagem entregue não é entregue de novo',
        citacao: 'O código apaga o conteúdo antes de entregar e só deixa verificar de novo o que ainda não foi executado.',
        formula: 'Executa(nn) ⟹ Menor(lazyA, nn) ∨ slotA(nn) ≠ vazio',
        fonte: `${EP}: lzReceive e _verifiable`,
      },
      {
        id: 'lz-nula',
        titulo: 'Mensagem anulada não é entregue antes de ser verificada de novo',
        citacao: 'nilify marca o pacote como verificado, mas impede a execução até nova verificação.',
        formula: 'Executa(nn) ⟹ slotA(nn) ≠ nulo',
        fonte: `${MC}: nilify`,
      },
      {
        id: 'lz-encerrada',
        titulo: 'Mensagem encerrada (entregue, queimada ou pulada) continua encerrada',
        citacao: 'Um nonce queimado nunca mais pode ser verificado nem executado.',
        formula: '∀n (Nonce(n) ∧ ¬Menor(lazyA, n) ∧ slotA(n) = vazio ⟹ ¬Menor(lazyD, n) ∧ slotD(n) = vazio)',
        fonte: `${MC}: burn`,
      },
      {
        id: 'lz-lazy',
        titulo: 'O nonce preguiçoso só avança',
        citacao: 'As mensagens só são liberadas em ordem, para resistir à censura.',
        formula: '¬Menor(lazyD, lazyA)',
        fonte: `${MC}: _inbound e _clearPayload`,
      },
      {
        id: 'lz-entregavel',
        titulo: 'Toda mensagem verificada pode ser entregue (promessa ingênua, para treinar)',
        citacao: 'Não está na documentação: é o tipo de promessa que parece óbvia e não vale.',
        formula: '∀n (Nonce(n) ∧ slotA(n) ≠ vazio ∧ slotA(n) ≠ nulo ⟹ ∀i (Nonce(i) ∧ Menor(lazyA, i) ∧ ¬Menor(n, i) ⟹ slotA(i) ≠ vazio))',
        fonte: '',
      },
    ],
  },
]

const AG = 'AxelarGateway.sol (axelar-cgp-solidity v6.4.0, igual ao da rede)'
const AW = 'auth/AxelarAuthWeighted.sol (axelar-cgp-solidity v6.4.0, igual ao da rede)'

MODELOS.push({
  id: 'axelar-gateway',
  nome: 'Axelar Gateway — comandos e aprovações (rascunho)',
  programa: 'https://immunefi.com/bug-bounty/axelarnetwork/information/',
  escopo:
    'Um passo: ou execute (um comando, com a prova de um conjunto de operadores), ou validateContractCall (o contrato de destino consome uma aprovação). No escopo do programa estão os proxies do Gateway em Ethereum, Avalanche, BNB, Polygon, Fantom, Aurora e Moonbeam, e os tokens axlUSDC (22 ativos). Crítica: 10% dos fundos afetados, até US$ 500 mil; alta: US$ 5 mil a 25 mil. Código obrigatório como prova; KYC com documento e reconhecimento facial, se o relatório for elegível. O que já está nos repositórios axelar-core, axelar-cgp-solidity, tofnd e tofn como problema conhecido não paga.',
  nota:
    'Rascunho tirado do código que roda no Ethereum: a implementação do proxy (0x99B5…4098) e o módulo de assinaturas (0xE3B8…8AD0) são idênticos à versão v6.4.0 do repositório axelar-cgp-solidity (em outras redes, confira). Na rede, a troca de operadores guarda o hash dos bytes recebidos, não da codificação padrão; o time corrigiu isso no repositório em março de 2026 (commit f6d7a1a): é conhecido, não paga. O peso e o limiar das assinaturas viraram propriedades (Assinou, Recente: dentro das últimas 16 épocas); a conta dos pesos fica para um próximo passo. A última promessa fura de propósito: o código não cancela aprovações quando os operadores mudam — uma pista para descartar.',
  regras: [
    {
      id: 'ax-tipos',
      titulo: 'Tipos: comandos, chaves de aprovação e conjuntos de operadores',
      formula:
        '(∀x ¬(Comando(x) ∧ Chave(x))) ∧ (∀x ¬(Comando(x) ∧ Conjunto(x))) ∧ (∀x ¬(Chave(x) ∧ Conjunto(x))) ∧ Comando(cc) ∧ Chave(kk) ∧ Conjunto(ss) ∧ Conjunto(atualA) ∧ Conjunto(atualD) ∧ ∀c (Comando(c) ⟹ Chave(chaveDe(c)) ∧ Conjunto(novo(c)))',
      fonte: `${AG}: commandIds, _getIsContractCallApprovedKey; ${AW}: hashForEpoch`,
    },
    {
      id: 'ax-chave',
      titulo: 'A chave da aprovação inclui o commandId (comandos diferentes, chaves diferentes)',
      formula: '∀c ∀d (Comando(c) ∧ Comando(d) ∧ chaveDe(c) = chaveDe(d) ⟹ c = d)',
      fonte: `${AG}: _getIsContractCallApprovedKey(commandId, …)`,
    },
    { id: 'ax-operacao', titulo: 'Acontece uma operação', formula: '(Executa(cc) ∨ Valida(kk)) ∧ ¬(Executa(cc) ∧ Valida(kk))', fonte: 'execute, validateContractCall' },
    {
      id: 'ax-prova',
      titulo: 'validateProof: o conjunto está nas últimas 16 épocas e as assinaturas atingem o limiar',
      formula: 'Executa(cc) ⟹ Recente(ss) ∧ Assinou(ss)',
      fonte: `${AW}: validateProof, _validateSignatures (OLD_KEY_RETENTION = 16)`,
    },
    { id: 'ax-atual', titulo: 'O conjunto atual é recente', formula: 'Recente(atualA)', fonte: `${AW}: currentEpoch` },
    {
      id: 'ax-tipo-comando',
      titulo: 'O comando é aprovar uma chamada ou trocar os operadores (os outros ficam fora do modelo)',
      formula: 'Executa(cc) ⟹ (Aprova(cc) ∨ Troca(cc)) ∧ ¬(Aprova(cc) ∧ Troca(cc))',
      fonte: `${AG}: execute (SELECTOR_APPROVE_CONTRACT_CALL, SELECTOR_TRANSFER_OPERATORSHIP)`,
    },
    { id: 'ax-resto', titulo: 'Os outros comandos não mudam', formula: '∀c (Comando(c) ∧ c ≠ cc ⟹ (ExecD(c) ⟺ ExecA(c)))', fonte: `${AG}: execute` },
    {
      id: 'ax-repetido',
      titulo: 'Comando já executado é ignorado',
      formula: 'Executa(cc) ∧ ExecA(cc) ⟹ ExecD(cc) ∧ atualD = atualA ∧ ∀k (Chave(k) ⟹ (AprovD(k) ⟺ AprovA(k)))',
      fonte: `${AG}: execute (if (isCommandExecuted(commandId)) continue)`,
    },
    {
      id: 'ax-aprovar',
      titulo: 'approveContractCall: marca o comando executado e aprova a chave dele',
      formula:
        'Executa(cc) ∧ ¬ExecA(cc) ∧ Aprova(cc) ⟹ ExecD(cc) ∧ AprovD(chaveDe(cc)) ∧ atualD = atualA ∧ ∀k (Chave(k) ∧ k ≠ chaveDe(cc) ⟹ (AprovD(k) ⟺ AprovA(k)))',
      fonte: `${AG}: _setCommandExecuted, approveContractCall`,
    },
    {
      id: 'ax-trocar',
      titulo: 'transferOperatorship com prova do conjunto atual: o novo conjunto vira o atual',
      formula:
        'Executa(cc) ∧ ¬ExecA(cc) ∧ Troca(cc) ∧ ss = atualA ⟹ ExecD(cc) ∧ atualD = novo(cc) ∧ novo(cc) ≠ atualA ∧ ∀k (Chave(k) ⟹ (AprovD(k) ⟺ AprovA(k)))',
      fonte: `${AG}: execute (allowOperatorshipTransfer); ${AW}: _transferOperatorship (DuplicateOperators)`,
    },
    {
      id: 'ax-trocar-nao',
      titulo: 'transferOperatorship com prova de outro conjunto: ignorado (não marca executado)',
      formula: 'Executa(cc) ∧ ¬ExecA(cc) ∧ Troca(cc) ∧ ss ≠ atualA ⟹ ¬ExecD(cc) ∧ atualD = atualA ∧ ∀k (Chave(k) ⟹ (AprovD(k) ⟺ AprovA(k)))',
      fonte: `${AG}: execute (if (!allowOperatorshipTransfer) continue)`,
    },
    {
      id: 'ax-validar',
      titulo: 'validateContractCall: entrega se a chave está aprovada, e consome a aprovação',
      formula:
        'Valida(kk) ⟹ (Entrega(kk) ⟺ AprovA(kk)) ∧ ¬AprovD(kk) ∧ atualD = atualA ∧ ∀k (Chave(k) ∧ k ≠ kk ⟹ (AprovD(k) ⟺ AprovA(k))) ∧ ∀c (Comando(c) ⟹ (ExecD(c) ⟺ ExecA(c)))',
      fonte: `${AG}: validateContractCall (_setBool(key, false))`,
    },
    { id: 'ax-entrega', titulo: 'Só a validação entrega', formula: 'Entrega(kk) ⟹ Valida(kk)', fonte: `${AG}: ContractCallExecuted` },
  ],
  promessas: [
    {
      id: 'ax-uma-vez',
      titulo: 'Uma chamada aprovada é entregue no máximo uma vez',
      citacao: 'Depois de validada, a chamada é marcada como executada para não rodar duas vezes.',
      formula: 'Entrega(kk) ⟹ ¬AprovD(kk)',
      fonte: `${AG}: comentário de validateContractCall`,
    },
    {
      id: 'ax-consumida',
      titulo: 'Uma aprovação consumida não volta',
      citacao: 'Comandos repetidos são ignorados.',
      formula: '∀c (Comando(c) ∧ ExecA(c) ∧ ¬AprovA(chaveDe(c)) ⟹ ¬AprovD(chaveDe(c)))',
      fonte: `${AG}: comentário de execute`,
    },
    {
      id: 'ax-origem',
      titulo: 'Toda aprovação vem de um comando executado',
      citacao: 'Só comandos assinados pelos operadores aprovam chamadas.',
      formula: '(∀c (Comando(c) ∧ AprovA(chaveDe(c)) ⟹ ExecA(c))) ⟹ (∀c (Comando(c) ∧ AprovD(chaveDe(c)) ⟹ ExecD(c)))',
      fonte: `${AG}: execute`,
    },
    {
      id: 'ax-so-atual',
      titulo: 'Só o conjunto atual troca os operadores',
      citacao: 'validateProof devolve verdadeiro só para os operadores atuais, e só eles podem trocar a operação.',
      formula: 'atualD ≠ atualA ⟹ ss = atualA',
      fonte: `${AW}: validateProof`,
    },
    {
      id: 'ax-prova-recente',
      titulo: 'Nada é aprovado sem prova de um conjunto recente',
      citacao: 'Prova de operadores fora das últimas épocas é recusada.',
      formula: '∀k (Chave(k) ∧ ¬AprovA(k) ∧ AprovD(k) ⟹ Recente(ss) ∧ Assinou(ss))',
      fonte: `${AW}: validateProof (InvalidOperators)`,
    },
    {
      id: 'ax-ingenua',
      titulo: 'Trocar os operadores cancela as aprovações antigas (promessa ingênua, para treinar)',
      citacao: 'Não está na documentação: parece razoável e não é o que o código faz.',
      formula: 'atualD ≠ atualA ⟹ ∀k (Chave(k) ⟹ ¬AprovD(k))',
      fonte: '',
    },
  ],
})
