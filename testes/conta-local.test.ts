import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { HDKey } from '@scure/bip32'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { canonicalizarV2 } from '../src/v2/canonico'
import { criarCofreTeste, assinarPerfilLocal, chaveDadosLocaisTeste, type CofreTeste } from '../src/v4/carteira'
import { conferirLedgerLocal, anexarEloLocal, enderecoLocal, hashEloLocal, mensagemOperacaoLocal, pubkeyDoEnderecoLocal, FORMATO_LEDGER, type OperacaoLocal, type LedgerLocal, type EloLocal } from '../src/local/protocolo'
import { dadosVazios, cifrarDadosConta, decifrarDadosConta } from '../src/local/dados'
import { criarBackupConta, lerBackupConta } from '../src/local/backup'
import { gravarLinhaLocal, gravarLinhasLocais, lerLinhaLocal } from '../src/local/banco'
import { bloquearContaLocal, criarContaLocal, entrarContaLocal, obterContaLocal, salvarDadosConta, criarRedeContaLocal, prepararTransferenciaLocal, enviarTransferenciaLocal, exportarBackupLocal, restaurarBackupLocal, importarLedgerContaLocal, derivarDestinoTesteLocal, iniciarSessaoLocal, INATIVIDADE_LOCAL_MS, STORAGE_COFRE_LOCAL } from '../src/local/conta'

// Credencial pública exclusivamente de fixture; nunca é credencial pessoal do aparelho.
const SENHA = 'fixture-publica-conta-local-2026'
const root = HDKey.fromMasterSeed(hexToBytes('000102030405060708090a0b0c0d0e0f'))
const a = root.derive("m/44'/1'/0'/0/0"), b = root.derive("m/44'/1'/0'/0/1")
const A = bytesToHex(a.publicKey!), B = bytesToHex(b.publicKey!)
let contador = 0, cofre: CofreTeste
const assinar = (op: OperacaoLocal, key = a): EloLocal => ({ operacao: op, assinatura: bytesToHex(key.sign(sha256(new TextEncoder().encode(mensagemOperacaoLocal(op))))) })
function genesis(): LedgerLocal {
  return { formato: FORMATO_LEDGER, rede: 'a'.repeat(64), elos: [assinar({ formato: 'cosmos-operacao-local-v1', tipo: 'genesis', rede: 'a'.repeat(64), autor: A, destinatario: A, quantidade: '1000000', indice: 0, anterior: '0'.repeat(64), pedido: (++contador).toString(16).padStart(32, '0'), criadoEm: 1 })] }
}
function transferir(l: LedgerLocal, valor = '80'): EloLocal { return assinar({ ...l.elos[0].operacao, tipo: 'transferencia', destinatario: B, quantidade: valor, indice: l.elos.length, anterior: hashEloLocal(l.elos.at(-1)!), pedido: (++contador).toString(16).padStart(32, '0') }) }
beforeAll(async () => { cofre = await criarCofreTeste(SENHA) })
afterAll(() => { a.wipePrivateData(); b.wipePrivateData(); root.wipePrivateData() })
beforeEach(() => {
  bloquearContaLocal()
  vi.stubGlobal('indexedDB', new IDBFactory())
  const dados = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => dados.set(k, v), removeItem: (k: string) => dados.delete(k), clear: () => dados.clear() })
  vi.stubGlobal('location', { hostname: '127.0.0.1' })
  let lock: Promise<unknown> = Promise.resolve()
  vi.stubGlobal('navigator', { locks: { request: (_nome: string, f: () => unknown) => { const atual = lock.then(f); lock = atual.catch(() => {}); return atual } } })
})
afterEach(() => { bloquearContaLocal(); vi.useRealTimers(); vi.unstubAllGlobals() })
const entrar = async () => { localStorage.setItem(STORAGE_COFRE_LOCAL, JSON.stringify(cofre)); await entrarContaLocal(SENHA, 'pessoa-teste') }

describe('Protocolo local assinado, separado de Bitcoin e do histórico', () => {
  it('genesis e transferência preservam supply e geram recibo verificável', () => {
    const g = genesis(), l = anexarEloLocal(g, transferir(g)), r = conferirLedgerLocal(l)
    expect(r.saldos.get(A)).toBe(999920n); expect(r.saldos.get(B)).toBe(80n); expect(r.supply).toBe(1000000n)
    expect(r.head).toBe(hashEloLocal(l.elos[1])); expect(g.elos).toHaveLength(1)
  })
  it('alterar quantidade, destino, autor ou rede invalida a assinatura', () => {
    for (const mudanca of [{ quantidade: '81' }, { destinatario: A }, { autor: B }, { rede: 'b'.repeat(64) }]) {
      const g = genesis(), tx = transferir(g)
      expect(() => anexarEloLocal(g, { ...tx, operacao: { ...tx.operacao, ...mudanca } })).toThrow('Assinatura')
    }
  })
  it('recusa replay, gasto duplo, saldo insuficiente e emissão após o genesis', () => {
    const g = genesis(), tx = transferir(g), l = anexarEloLocal(g, tx)
    expect(() => anexarEloLocal(l, tx)).toThrow('sequência')
    expect(() => anexarEloLocal(g, transferir(g, '1000001'))).toThrow('Saldo')
    const op = { ...transferir(l).operacao, tipo: 'genesis' as const, destinatario: A }
    expect(() => anexarEloLocal(l, assinar(op))).toThrow('Transferência')
  })
  it('valores são strings inteiras e não admitem float, zero ou notação exponencial', () => {
    const g = genesis()
    for (const quantidade of ['0', '-1', '1.2', '1e3', '01', '1000000001', 80]) {
      expect(() => assinar({ ...g.elos[0].operacao, quantidade } as OperacaoLocal)).toThrow()
    }
  })
  it('rede, anterior e pedido repetido são verificados mesmo com assinatura válida', () => {
    const g = genesis(), tx = transferir(g)
    for (const alteracao of [{ rede: 'b'.repeat(64) }, { anterior: 'b'.repeat(64) }, { pedido: g.elos[0].operacao.pedido }]) {
      expect(() => anexarEloLocal(g, assinar({ ...tx.operacao, ...alteracao }))).toThrow('divergente')
    }
  })
  it('endereço interno exige ponto secp válido e recusa tb1q/endereços externos', () => {
    expect(pubkeyDoEnderecoLocal(enderecoLocal(A))).toBe(A)
    const valido = enderecoLocal(A)
    expect(() => pubkeyDoEnderecoLocal(valido.slice(0, -1) + (valido.at(-1) === '0' ? '1' : '0'))).toThrow('Checksum')
    for (const d of ['tb1qalgo', '0x123', 'cosmos-local:' + '02' + '0'.repeat(64)]) expect(() => pubkeyDoEnderecoLocal(d)).toThrow()
  })
})

describe('Dados cifrados, backup e persistência concorrente', () => {
  it('autentica titular e cifra; dados errados ou outra chave não são tratados como vazios', async () => {
    const perfil = await assinarPerfilLocal(cofre, SENHA, 'teste'), k = await chaveDadosLocaisTeste(cofre, SENHA)
    const d = dadosVazios(); d.conversas = [{ id: 1, pergunta: 'texto privado de fixture', resposta: 'resposta local' }]
    const cifra = await cifrarDadosConta(d, k, perfil.perfil.pubkey)
    expect(JSON.stringify(cifra)).not.toContain('texto privado')
    expect(await decifrarDadosConta(cifra, k, perfil.perfil.pubkey)).toEqual(d)
    const ruim = { ...cifra, cifrado: (cifra.cifrado[0] === '0' ? '1' : '0') + cifra.cifrado.slice(1) }
    await expect(decifrarDadosConta(ruim, k, perfil.perfil.pubkey)).rejects.toThrow('corrompidos')
    await expect(decifrarDadosConta(cifra, k, A)).rejects.toThrow('Envelope')
  })
  it('backup valida metadados e não contém seed ou chave privada em claro', async () => {
    const perfil = await assinarPerfilLocal(cofre, SENHA, 'teste'), backup = criarBackupConta(cofre, perfil, null, null)
    expect(lerBackupConta(canonicalizarV2(backup))).toEqual(backup)
    expect(Object.keys(backup.cofre)).not.toContain('seed')
    expect(() => lerBackupConta(canonicalizarV2({ ...backup, extra: true }))).toThrow('Backup')
    expect(() => lerBackupConta(canonicalizarV2({ ...backup, resumo: '0'.repeat(64) }))).toThrow('Resumo')
    expect(() => lerBackupConta('{"formato":"a","formato":"b"}')).toThrow()
  })
  it('CAS admite só uma escrita concorrente; lote com conflito não grava parcialmente', async () => {
    const tentativas = await Promise.allSettled([gravarLinhaLocal('teste', 0, 'a'), gravarLinhaLocal('teste', 0, 'b')])
    expect(tentativas.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    await expect(gravarLinhasLocais([{ chave: 'novo', esperado: 0, valor: 'x' }, { chave: 'teste', esperado: 0, valor: 'z' }])).rejects.toThrow('Conflito')
    expect(await lerLinhaLocal('novo')).toBeNull()
    expect((await lerLinhaLocal('teste'))?.revisao).toBe(1)
  })
  it('limita tamanho antes de gravar', async () => {
    await expect(gravarLinhaLocal('grande', 0, 'x'.repeat(262145))).rejects.toThrow('limite')
    expect(await lerLinhaLocal('grande')).toBeNull()
  })
})

describe('Fluxo completo da conta de teste', () => {
  it('reutiliza cofre V4, mantém dados cifrados entre bloqueio e nova entrada', async () => {
    await entrar()
    await salvarDadosConta(d => ({ ...d, rascunhos: [{ id: 'D01', nome: 'Fixture privada', formula: 'A', dominio: 'Teste', descricao: 'Rascunho', rascunho: true }] }))
    const pub = obterContaLocal().perfil!.perfil.pubkey
    expect((await lerLinhaLocal(`dados:${pub}`))?.valor).not.toContain('Fixture privada')
    bloquearContaLocal(); expect(obterContaLocal().dados).toBeNull()
    await entrarContaLocal(SENHA, 'pessoa-teste')
    expect(obterContaLocal().dados?.rascunhos[0].nome).toBe('Fixture privada')
    expect(localStorage.getItem(STORAGE_COFRE_LOCAL)).toBe(JSON.stringify(cofre))
  })
  it('senha errada não desbloqueia, e criar/restaurar não sobrescreve cofre existente', async () => {
    await entrar(); const antes = localStorage.getItem(STORAGE_COFRE_LOCAL)
    bloquearContaLocal()
    await expect(entrarContaLocal('fixture-senha-incorreta', 'teste')).rejects.toThrow()
    expect(obterContaLocal().perfil).toBeNull()
    await expect(criarContaLocal(SENHA, 'teste')).rejects.toThrow('Já existe')
    await expect(restaurarBackupLocal('{}', SENHA)).rejects.toThrow('sem cofre')
    expect(localStorage.getItem(STORAGE_COFRE_LOCAL)).toBe(antes)
  })
  it('assina transferência, exige a senha, recusa repetição e reconstrói saldo', async () => {
    await entrar(); await criarRedeContaLocal(SENHA, '1000000')
    const destino = await derivarDestinoTesteLocal(SENHA), op = prepararTransferenciaLocal(destino, '80')
    await expect(enviarTransferenciaLocal(op, 'fixture-senha-incorreta')).rejects.toThrow()
    expect(obterContaLocal().ledger?.elos).toHaveLength(1)
    const recibo = await enviarTransferenciaLocal(op, SENHA)
    expect(recibo).toMatch(/^[a-f0-9]{64}$/)
    await expect(enviarTransferenciaLocal(op, SENHA)).rejects.toThrow('sequência')
    bloquearContaLocal(); await entrarContaLocal(SENHA, 'teste')
    const estado = obterContaLocal(), v = conferirLedgerLocal(estado.ledger!)
    expect(v.saldos.get(estado.perfil!.perfil.pubkey)).toBe(999920n)
    expect(v.saldos.get(pubkeyDoEnderecoLocal(destino))).toBe(80n)
  }, 20000)
  it('backup restaura dados e ledger; restauração com senha errada não grava cofre', async () => {
    await entrar(); await criarRedeContaLocal(SENHA, '1000')
    await salvarDadosConta(d => ({ ...d, conversas: [{ id: 1, pergunta: 'F2', resposta: 'fixture local' }] }))
    const backup = await exportarBackupLocal(), head = conferirLedgerLocal(obterContaLocal().ledger!).head
    bloquearContaLocal(); localStorage.clear(); vi.stubGlobal('indexedDB', new IDBFactory())
    await expect(restaurarBackupLocal(backup, 'fixture-senha-incorreta')).rejects.toThrow()
    expect(localStorage.getItem(STORAGE_COFRE_LOCAL)).toBeNull()
    await restaurarBackupLocal(backup, SENHA)
    expect(obterContaLocal().dados?.conversas[0].pergunta).toBe('F2')
    expect(conferirLedgerLocal(obterContaLocal().ledger!).head).toBe(head)
  }, 20000)
  it('conflito externo de dados impede salvar e impede exportar backup desatualizado', async () => {
    await entrar(); await salvarDadosConta(d => d)
    const pub = obterContaLocal().perfil!.perfil.pubkey, linha = (await lerLinhaLocal(`dados:${pub}`))!
    await gravarLinhaLocal(linha.chave, linha.revisao, linha.valor)
    await expect(salvarDadosConta(d => d)).rejects.toThrow('Conflito')
    await expect(exportarBackupLocal()).rejects.toThrow('outra aba')
  })
  it('restauração retoma após quota falhar ao gravar cofre, sem substituir bytes de dados', async () => {
    await entrar(); await salvarDadosConta(d => ({ ...d, conversas: [{ id: 1, pergunta: 'F0', resposta: 'teste' }] }))
    const backup = await exportarBackupLocal()
    bloquearContaLocal(); localStorage.clear(); vi.stubGlobal('indexedDB', new IDBFactory())
    const setter = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('quota de fixture') })
    await expect(restaurarBackupLocal(backup, SENHA)).rejects.toThrow('quota')
    expect(localStorage.getItem(STORAGE_COFRE_LOCAL)).toBeNull()
    setter.mockRestore()
    await restaurarBackupLocal(backup, SENHA)
    expect(obterContaLocal().dados?.conversas[0].pergunta).toBe('F0')
  }, 20000)
  it('backup de perfil válido mas de outro cofre não é restaurado', async () => {
    const outro = await criarCofreTeste(SENHA), outroPerfil = await assinarPerfilLocal(outro, SENHA, 'outro')
    const misturado = criarBackupConta(cofre, outroPerfil, null, null)
    await expect(restaurarBackupLocal(canonicalizarV2(misturado), SENHA)).rejects.toThrow('titular')
    expect(localStorage.getItem(STORAGE_COFRE_LOCAL)).toBeNull()
  }, 15000)
  it('bloquear uma transferência enfileirada impede sua gravação', async () => {
    await entrar(); await criarRedeContaLocal(SENHA, '1000')
    const rede = obterContaLocal().ledger!.rede, op = prepararTransferenciaLocal(enderecoLocal(B), '10')
    const pendente = enviarTransferenciaLocal(op, SENHA)
    bloquearContaLocal()
    await expect(pendente).rejects.toThrow('Sessão')
    expect(JSON.parse((await lerLinhaLocal(`ledger:${rede}`))!.valor).elos).toHaveLength(1)
  }, 15000)
  it('importação preserva prefixo mais longo e recusa fork assinado', async () => {
    await entrar()
    const g = genesis(), l = anexarEloLocal(g, transferir(g))
    await importarLedgerContaLocal(canonicalizarV2(l)); await importarLedgerContaLocal(canonicalizarV2(g))
    expect(obterContaLocal().ledger?.elos).toHaveLength(2)
    const fork = anexarEloLocal(g, transferir(g, '81'))
    await expect(importarLedgerContaLocal(canonicalizarV2(fork))).rejects.toThrow('Bifurcação')
    expect(conferirLedgerLocal(obterContaLocal().ledger!).head).toBe(conferirLedgerLocal(l).head)
  })
  it('recusa operações bloqueadas, cofre alterado, e rede pública', async () => {
    await expect(salvarDadosConta(d => d)).rejects.toThrow('Entre')
    await entrar(); localStorage.setItem(STORAGE_COFRE_LOCAL, '{}')
    await expect(salvarDadosConta(d => d)).rejects.toThrow('Entre novamente')
    expect(obterContaLocal().perfil).toBeNull()
    vi.stubGlobal('location', { hostname: 'exemplo.com' })
    await expect(entrarContaLocal(SENHA, 'teste')).rejects.toThrow('localhost')
  })
  it('bloqueia automaticamente por inatividade sem reter senha ou dados no snapshot', async () => {
    await entrar(); const eventos = new EventTarget()
    vi.stubGlobal('window', eventos); vi.useFakeTimers()
    const limpar = iniciarSessaoLocal()
    try {
      vi.advanceTimersByTime(INATIVIDADE_LOCAL_MS - 60000)
      eventos.dispatchEvent(new Event('pointerdown'))
      vi.advanceTimersByTime(60000)
      expect(obterContaLocal().perfil).not.toBeNull()
      vi.advanceTimersByTime(INATIVIDADE_LOCAL_MS + 1000)
      expect(obterContaLocal().perfil).toBeNull(); expect(obterContaLocal().dados).toBeNull()
      expect(Object.keys(obterContaLocal()).sort()).toEqual(['dados', 'erro', 'ledger', 'perfil'])
    } finally { limpar() }
  })
})
