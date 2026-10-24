import { beforeAll, describe, expect, it, vi } from 'vitest'
import { HDKey } from '@scure/bip32'
import { bech32 } from '@scure/base'
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js'
import { criarCofreTeste, lerCofreTeste, derivarEnderecoTeste, enderecoTesteDaPubkey, assinarPerfilLocal, verificarPerfilLocal, ITERACOES, CAMINHO_TESTE, type CofreTeste, type PerfilAssinado } from '../src/v4/carteira'
import { iniciarLocalnetTeste, somenteHostLocal } from '../src/v4/localnet'
import { ATORES_DEMO, travarOferta, liquidarCenario, saldoSimulado } from '../src/v3/escrowSimulado'
import { lerRota } from '../src/ui/rotas'

// Credencial pública de teste. Nunca usar em ambiente com ativos reais.
const SENHA = 'fixture-publica-v4-nao-usar'
let cofre: CofreTeste, perfil: PerfilAssinado
beforeAll(async () => {
  cofre = await criarCofreTeste(SENHA)
  perfil = await assinarPerfilLocal(cofre, SENHA, 'pessoa-teste')
})
describe('Cofre e identidade V4 somente teste', () => {
  it('retorna apenas envelope cifrado, sem seed, chave privada ou HDKey serializável', () => {
    expect(Object.keys(cofre).sort()).toEqual(['cifrado', 'formato', 'iteracoes', 'iv', 'kdf', 'rede', 'sal'])
    expect(cofre.iteracoes).toBe(ITERACOES)
    expect(cofre.cifrado).toMatch(/^[a-f0-9]{96}$/)
    expect(lerCofreTeste(JSON.stringify(cofre))).toEqual(cofre)
  })
  it('nova geração tem sal/IV/cifra distintos e não admite senha curta', async () => {
    const outro = await criarCofreTeste(SENHA)
    expect(outro.sal).not.toBe(cofre.sal); expect(outro.iv).not.toBe(cofre.iv); expect(outro.cifrado).not.toBe(cofre.cifrado)
    await expect(criarCofreTeste('curta')).rejects.toThrow()
  })
  it('senha incorreta e adulteração da cifra, sal ou IV falham na autenticação', async () => {
    await expect(derivarEnderecoTeste(cofre, 'senha-incorreta-longa', 0)).rejects.toThrow('não autenticado')
    for (const campo of ['cifrado', 'sal', 'iv'] as const) {
      const valor = cofre[campo], alterado = (valor[0] === '0' ? '1' : '0') + valor.slice(1)
      await expect(derivarEnderecoTeste({ ...cofre, [campo]: alterado }, SENHA, 0)).rejects.toThrow('não autenticado')
    }
  })
  it('rejeita KDF manipulada, metadados extra, JSON duplicado ou cofre excessivo', async () => {
    await expect(derivarEnderecoTeste({ ...cofre, iteracoes: 1 } as unknown as CofreTeste, SENHA, 0)).rejects.toThrow('Parâmetros')
    expect(() => lerCofreTeste(JSON.stringify({ ...cofre, seed: 'proibida' }))).toThrow()
    expect(() => lerCofreTeste(JSON.stringify(cofre).replace('{', '{"rede":"localnet-cosmos",'))).toThrow()
    expect(() => lerCofreTeste(' '.repeat(2049))).toThrow()
    const getter = vi.fn(() => 'algo')
    expect(() => lerCofreTeste(JSON.stringify({ a: 1 }))).toThrow()
    await expect(derivarEnderecoTeste(Object.defineProperty({ ...cofre }, 'sal', { get: getter }), SENHA, 0)).rejects.toThrow('acessores')
    expect(getter).not.toHaveBeenCalled()
  })
  it('mesmo cofre deriva deterministamente no caminho autorizado e índices diferentes divergem', async () => {
    const a = await derivarEnderecoTeste(cofre, SENHA, 0), b = await derivarEnderecoTeste(cofre, SENHA, 0), c = await derivarEnderecoTeste(cofre, SENHA, 1)
    expect(a).toEqual(b); expect(a.caminho).toBe(CAMINHO_TESTE + '0'); expect(c.endereco).not.toBe(a.endereco)
    expect(a.endereco).toMatch(/^tb1q/); expect(a.pubkey).toHaveLength(66)
    expect(bech32.decode(a.endereco as `tb1${string}`).words[0]).toBe(0)
    expect(bech32.fromWords(bech32.decode(a.endereco as `tb1${string}`).words.slice(1))).toHaveLength(20)
    expect(Object.keys(a).sort()).toEqual(['caminho', 'endereco', 'indice', 'pubkey'])
  })
  it('recusa índices negativos, fracionários, não finitos e hardened no último nível', async () => {
    for (const n of [-1, 0.5, Infinity, NaN, 0x80000000]) await expect(derivarEnderecoTeste(cofre, SENHA, n)).rejects.toThrow('Índice')
  })
  it('confere vetor de endereço testnet do BIP173', () => {
    expect(enderecoTesteDaPubkey(hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'))).toBe('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')
    expect(() => enderecoTesteDaPubkey(new Uint8Array(33))).toThrow()
  })
  it('biblioteca HD confere chave do vetor público BIP32 no caminho m/0 hardened', () => {
    // Seed publicada BIP32 vetor 1; nenhuma seed do aparelho é usada como fixture.
    const root = HDKey.fromMasterSeed(hexToBytes('000102030405060708090a0b0c0d0e0f'))
    const child = root.derive("m/0'")
    try { expect(bytesToHex(child.publicKey!)).toBe('035a784662a4a20a65bf6aab9ae98a6c068a81c52e4b032c0fb5400c706cfccc56') }
    finally { root.wipePrivateData(); child.wipePrivateData() }
  })
  it('perfil assinado verifica sob sua chave; alterações de conteúdo e envelope não verificam', () => {
    expect(verificarPerfilLocal(perfil)).toBe(true)
    expect(perfil.perfil.escopo).toBe('autoria-sob-chave-nao-identidade-civil')
    for (const mudanca of [{ apelido: 'outro' }, { rede: 'sepolia' }, { caminho: "m/84'/1'/0'/0/0" }, { endereco: 'tb1qinvalido' }, { pubkey: '02' + '0'.repeat(64) }]) {
      expect(verificarPerfilLocal({ ...perfil, perfil: { ...perfil.perfil, ...mudanca } } as PerfilAssinado)).toBe(false)
    }
    expect(verificarPerfilLocal({ ...perfil, assinatura: '0'.repeat(128) })).toBe(false)
    expect(verificarPerfilLocal({ ...perfil, extra: true } as PerfilAssinado)).toBe(false)
    const getter = vi.fn(() => perfil.perfil)
    expect(verificarPerfilLocal(Object.defineProperty({ ...perfil }, 'perfil', { get: getter }))).toBe(false)
    expect(getter).not.toHaveBeenCalled()
  })
  it('recusa apelido com dados arbitrários ou Unicode fora de NFC', async () => {
    for (const apelido of ['', '<script>', 'a'.repeat(41), 'e\u0301']) await expect(assinarPerfilLocal(cofre, SENHA, apelido)).rejects.toThrow('Apelido')
  })
})
describe('Genesis local e integração de queima V3', () => {
  it('mint inicial padrão de 1 milhão é local e explicitamente sem valor', () => {
    const n = iniciarLocalnetTeste(perfil)
    expect(n.genesis.unidade).toBe('UNIDADE-TESTE-SEM-VALOR')
    expect(n.estado.totalInicial).toBe(1000000n)
    expect(n.estado.utxos).toHaveLength(1)
    expect(n.genesis.iniciadorPubkey).toBe(perfil.perfil.pubkey)
    expect(n.genesis.destinatario).toBe('demo:solicitante')
    expect(n.hashGenesis).toHaveLength(64)
  })
  it('supply/queima são fixados no genesis e entram no hash; limites recusados', () => {
    const a = iniciarLocalnetTeste(perfil, 123n, 0), b = iniciarLocalnetTeste(perfil, 123n, 1)
    expect(a.hashGenesis).not.toBe(b.hashGenesis)
    expect(a.estado.totalInicial).toBe(123n)
    for (const n of [0n, -1n, 1000000001n]) expect(() => iniciarLocalnetTeste(perfil, n)).toThrow('Supply')
    for (const n of [-1, 10001, 1.5, Infinity]) expect(() => iniciarLocalnetTeste(perfil, 1n, n)).toThrow('Queima')
    expect(() => iniciarLocalnetTeste({ ...perfil, assinatura: '0'.repeat(128) })).toThrow('Autoria')
  })
  it('trava 80, paga 76 e queima 4 conservando 1 milhão; entrada consumida não reaparece', () => {
    const n = iniciarLocalnetTeste(perfil), [solicitante, provedor] = ATORES_DEMO
    const p = { id: 'V4-DEMO-1', solicitante, entradas: [n.estado.utxos[0].id], valor: 80n, expira: 1000, hashProblema: 'a'.repeat(64) }
    const aberto = travarOferta(n.estado, p, 0)
    const cert = { fonte: 'fixture-simulada' as const, oferta: p.id, provedor, hashProblema: p.hashProblema, hashCertificado: 'b'.repeat(64), resultadoSimulado: 'valido' as const }
    const fim = liquidarCenario(aberto, cert, 1)
    expect(saldoSimulado(fim, solicitante)).toBe(999920n); expect(saldoSimulado(fim, provedor)).toBe(76n); expect(fim.queimado).toBe(4n)
    expect(fim.utxos.reduce((n, u) => n + u.valor, fim.queimado)).toBe(1000000n)
    expect(() => travarOferta(fim, { ...p, id: 'replay' }, 0)).toThrow()
    expect(() => liquidarCenario(fim, cert, 2)).toThrow()
    expect(n.estado.utxos[0].valor).toBe(1000000n)
  })
  it('permite laboratório somente em loopback e reconhece rota V4', () => {
    for (const h of ['localhost', '127.0.0.1', '[::1]', '::1']) expect(somenteHostLocal(h)).toBe(true)
    for (const h of ['onethink-stack.github.io', 'localhost.evil', '192.168.1.10', '']) expect(somenteHostLocal(h)).toBe(false)
    expect(lerRota('#/laboratorio')).toEqual({ tela: 'laboratorio' })
  })
})
