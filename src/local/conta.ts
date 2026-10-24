import { bytesToHex } from '@noble/hashes/utils.js'
import { canonicalizarV2, lerCanonicoV2 } from '../v2/canonico'
import { criarCofreTeste, lerCofreTeste, assinarPerfilLocal, chaveDadosLocaisTeste, assinarOperacaoLocalTeste, derivarEnderecoTeste, type CofreTeste, type PerfilAssinado } from '../v4/carteira'
import { somenteHostLocal } from '../v4/localnet'
import { dadosVazios, cifrarDadosConta, decifrarDadosConta, type DadosConta, type DadosCifrados } from './dados'
import { lerLinhaLocal, gravarLinhaLocal, gravarLinhasLocais } from './banco'
import { criarBackupConta, lerBackupConta } from './backup'
import { anexarEloLocal, conferirLedgerLocal, enderecoLocal, FORMATO_LEDGER, hashEloLocal, lerLedgerLocal, pubkeyDoEnderecoLocal, type LedgerLocal, type OperacaoLocal } from './protocolo'

export const STORAGE_COFRE_LOCAL = 'cosmos:v4:cofre-teste' // reaproveita, nunca substitui silenciosamente
export const INATIVIDADE_LOCAL_MS = 10 * 60 * 1000
export interface EstadoConta { perfil: PerfilAssinado | null; dados: DadosConta | null; ledger: LedgerLocal | null; erro: string }
let estado: EstadoConta = { perfil: null, dados: null, ledger: null, erro: '' }
let chave: CryptoKey | null = null, cofreAtual: string | null = null, revisaoDados = 0, geracao = 0, atividade = 0
let fila: Promise<unknown> = Promise.resolve()
const ouvintes = new Set<() => void>()
export const obterContaLocal = () => estado
export const observarContaLocal = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }
const publicar = (e: EstadoConta) => { estado = e; ouvintes.forEach(f => f()) }
const local = () => { if (typeof location === 'undefined' || !somenteHostLocal(location.hostname)) throw new Error('Conta e operações permitidas somente em localhost') }
export function bloquearContaLocal(motivo = ''): void {
  geracao++; chave = null; cofreAtual = null; revisaoDados = 0
  publicar({ perfil: null, dados: null, ledger: null, erro: motivo })
}
export function iniciarSessaoLocal(): () => void {
  const tocar = () => { if (estado.perfil) atividade = Date.now() }
  const storage = (e: StorageEvent) => { if (e.key === STORAGE_COFRE_LOCAL || e.key === null) bloquearContaLocal('Armazenamento do cofre mudou em outra aba') }
  window.addEventListener('pointerdown', tocar); window.addEventListener('keydown', tocar); window.addEventListener('storage', storage)
  const timer = setInterval(() => { if (estado.perfil && Date.now() - atividade >= INATIVIDADE_LOCAL_MS) bloquearContaLocal('Sessão bloqueada por inatividade') }, 1000)
  return () => { clearInterval(timer); window.removeEventListener('pointerdown', tocar); window.removeEventListener('keydown', tocar); window.removeEventListener('storage', storage); bloquearContaLocal() }
}
export function existeCofreLocal(): boolean { local(); return localStorage.getItem(STORAGE_COFRE_LOCAL) !== null }
function autenticada(): { titular: string; dados: DadosConta; chave: CryptoKey; geracao: number; cofre: CofreTeste } {
  local()
  if (!estado.perfil || !estado.dados || !chave || !cofreAtual) throw new Error('Entre na conta local para continuar')
  if (Date.now() - atividade >= INATIVIDADE_LOCAL_MS || localStorage.getItem(STORAGE_COFRE_LOCAL) !== cofreAtual) { bloquearContaLocal('Sessão expirada ou cofre alterado'); throw new Error('Entre novamente') }
  return { titular: estado.perfil.perfil.pubkey, dados: estado.dados, chave, geracao, cofre: lerCofreTeste(cofreAtual) }
}
function atual(g: number): void { if (g !== geracao || !estado.perfil) throw new Error('Sessão bloqueada; operação cancelada') }
function serial<T>(f: () => Promise<T>): Promise<T> {
  const g = geracao
  const p = fila.then(() => { if (g !== geracao) throw new Error('Sessão mudou; tente novamente'); return f() })
  fila = p.catch(() => {}); return p
}
async function lockCofre<T>(acao: () => Promise<T>): Promise<T> {
  local(); if (!navigator.locks) throw new Error('Este navegador precisa de Web Locks para operar o cofre')
  return navigator.locks.request(STORAGE_COFRE_LOCAL, acao)
}
export async function criarContaLocal(senha: string, apelido: string): Promise<void> {
  local()
  if (existeCofreLocal()) throw new Error('Já existe um cofre. Desbloqueie ou restaure em outra origem vazia')
  const cofre = await criarCofreTeste(senha)
  await assinarPerfilLocal(cofre, senha, apelido) // valida senha/perfil antes da persistência
  await lockCofre(async () => {
    if (localStorage.getItem(STORAGE_COFRE_LOCAL) !== null) throw new Error('Outra aba já criou um cofre')
    localStorage.setItem(STORAGE_COFRE_LOCAL, JSON.stringify(cofre))
  })
  await entrarContaLocal(senha, apelido)
}
export async function entrarContaLocal(senha: string, apelido: string): Promise<void> {
  local(); bloquearContaLocal()
  const g = geracao, texto = localStorage.getItem(STORAGE_COFRE_LOCAL)
  if (!texto) throw new Error('Nenhum cofre disponível neste aparelho/origem')
  const cofre = lerCofreTeste(texto), perfil = await assinarPerfilLocal(cofre, senha, apelido)
  const k = await chaveDadosLocaisTeste(cofre, senha), titular = perfil.perfil.pubkey
  const linha = await lerLinhaLocal(`dados:${titular}`)
  const dados = linha ? await decifrarDadosConta(lerCanonicoV2(linha.valor) as DadosCifrados, k, titular) : dadosVazios()
  const rede = dados.redeAtiva ? await lerLinhaLocal(`ledger:${dados.redeAtiva}`) : null
  if (dados.redeAtiva && !rede) throw new Error('Ledger ativo ausente; restaure o backup, sem reiniciar o saldo')
  const ledger = rede ? lerLedgerLocal(rede.valor) : null
  if (g !== geracao || localStorage.getItem(STORAGE_COFRE_LOCAL) !== texto) throw new Error('Cofre ou sessão mudou durante o acesso')
  chave = k; cofreAtual = texto; revisaoDados = linha?.revisao ?? 0; atividade = Date.now()
  publicar({ perfil, dados, ledger, erro: '' })
}
export function salvarDadosConta(mudar: (d: DadosConta) => DadosConta): Promise<void> {
  return serial(async () => {
    const a = autenticada(), novos = mudar(structuredClone(a.dados))
    const cifra = await cifrarDadosConta(novos, a.chave, a.titular); atual(a.geracao)
    const linha = await gravarLinhaLocal(`dados:${a.titular}`, revisaoDados, canonicalizarV2(cifra))
    if (a.geracao === geracao) { revisaoDados = linha.revisao; publicar({ ...estado, dados: novos }) }
  })
}
const pedido = () => bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
export function prepararTransferenciaLocal(destino: string, quantidade: string): OperacaoLocal {
  const a = autenticada(), l = estado.ledger
  if (!l) throw new Error('Crie ou importe uma rede local de teste primeiro')
  const { head, saldos } = conferirLedgerLocal(l), destinatario = pubkeyDoEnderecoLocal(destino.trim())
  if (!/^[1-9][0-9]{0,9}$/.test(quantidade) || BigInt(quantidade) > (saldos.get(a.titular) ?? 0n) || destinatario === a.titular) throw new Error('Quantidade, saldo ou destinatário inválido')
  return { formato: 'cosmos-operacao-local-v1', tipo: 'transferencia', rede: l.rede, autor: a.titular, destinatario, quantidade, indice: l.elos.length, anterior: head, pedido: pedido(), criadoEm: Date.now() }
}
export function criarRedeContaLocal(senha: string, supply: string): Promise<void> {
  return serial(async () => {
    const a = autenticada()
    if (a.dados.redeAtiva || !/^[1-9][0-9]{0,9}$/.test(supply) || BigInt(supply) > 1000000000n) throw new Error('Rede já ativa ou supply inválido')
    const rede = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
    const op: OperacaoLocal = { formato: 'cosmos-operacao-local-v1', tipo: 'genesis', rede, autor: a.titular, destinatario: a.titular, quantidade: supply, indice: 0, anterior: '0'.repeat(64), pedido: pedido(), criadoEm: Date.now() }
    const elo = await assinarOperacaoLocalTeste(a.cofre, senha, op)
    const ledger: LedgerLocal = { formato: FORMATO_LEDGER, rede, elos: [elo] }; conferirLedgerLocal(ledger)
    const dados = { ...a.dados, redeAtiva: rede }, cifra = await cifrarDadosConta(dados, a.chave, a.titular)
    atual(a.geracao)
    const [linha] = await gravarLinhasLocais([{ chave: `dados:${a.titular}`, esperado: revisaoDados, valor: canonicalizarV2(cifra) }, { chave: `ledger:${rede}`, esperado: 0, valor: canonicalizarV2(ledger) }])
    if (a.geracao === geracao) { revisaoDados = linha.revisao; publicar({ ...estado, dados, ledger }) }
  })
}
export function enviarTransferenciaLocal(op: OperacaoLocal, senha: string): Promise<string> {
  return serial(async () => {
    const a = autenticada()
    if (op.tipo !== 'transferencia' || op.autor !== a.titular || op.rede !== a.dados.redeAtiva) throw new Error('Operação não autorizada nesta sessão/rede')
    const linha = await lerLinhaLocal(`ledger:${op.rede}`)
    if (!linha) throw new Error('Ledger ausente')
    const ledger = lerLedgerLocal(linha.valor)
    // Confirmação fica vinculada à sequência exibida na prévia, sem rebase silencioso.
    const elo = await assinarOperacaoLocalTeste(a.cofre, senha, op), novo = anexarEloLocal(ledger, elo)
    atual(a.geracao)
    await gravarLinhaLocal(`ledger:${op.rede}`, linha.revisao, canonicalizarV2(novo))
    if (a.geracao === geracao) publicar({ ...estado, ledger: novo })
    return hashEloLocal(elo) // commit concluído continua sendo sucesso, mesmo se a sessão bloquear depois
  })
}
export async function derivarDestinoTesteLocal(senha: string): Promise<string> {
  const a = autenticada(), e = await derivarEnderecoTeste(a.cofre, senha, 1); atual(a.geracao); return enderecoLocal(e.pubkey)
}
export function exportarBackupLocal(): Promise<string> { return serial(async () => {
  const a = autenticada(), revisao = revisaoDados, linha = await lerLinhaLocal(`dados:${a.titular}`)
  if ((linha?.revisao ?? 0) !== revisao) throw new Error('Dados mudaram em outra aba; entre novamente antes do backup')
  const dados = linha ? lerCanonicoV2(linha.valor) as DadosCifrados : null
  const linhaRede = a.dados.redeAtiva ? await lerLinhaLocal(`ledger:${a.dados.redeAtiva}`) : null
  if (a.dados.redeAtiva && !linhaRede) throw new Error('Ledger ausente; backup não gerado')
  atual(a.geracao)
  return canonicalizarV2(criarBackupConta(a.cofre, estado.perfil!, dados, linhaRede ? lerLedgerLocal(linhaRede.valor) : null))
}) }
export async function restaurarBackupLocal(texto: string, senha: string): Promise<void> {
  local(); if (existeCofreLocal()) throw new Error('Restauração exige origem sem cofre; o atual não será substituído')
  const b = lerBackupConta(texto), perfil = await assinarPerfilLocal(b.cofre, senha, b.perfil.perfil.apelido)
  if (perfil.perfil.pubkey !== b.perfil.perfil.pubkey) throw new Error('Cofre não corresponde ao titular do backup')
  const k = await chaveDadosLocaisTeste(b.cofre, senha)
  const dados = b.dados ? await decifrarDadosConta(b.dados, k, perfil.perfil.pubkey) : dadosVazios()
  if (dados.redeAtiva !== (b.ledger?.rede ?? null)) throw new Error('Rede ativa do backup divergente')
  await lockCofre(async () => {
    if (existeCofreLocal()) throw new Error('Cofre já existe; nada foi substituído')
    const itens = []
    if (b.dados) itens.push({ chave: `dados:${perfil.perfil.pubkey}`, esperado: 0, valor: canonicalizarV2(b.dados) })
    if (b.ledger) itens.push({ chave: `ledger:${b.ledger.rede}`, esperado: 0, valor: canonicalizarV2(b.ledger) })
    // Repetição após falha de quota no localStorage pode reutilizar bytes já gravados.
    // Conteúdo existente diferente nunca é substituído pela restauração.
    const ausentes = []
    for (const item of itens) {
      const existente = await lerLinhaLocal(item.chave)
      if (!existente) ausentes.push(item)
      else if (existente.valor !== item.valor) throw new Error('Dados locais já existem e divergem do backup; nada foi substituído')
    }
    if (ausentes.length) await gravarLinhasLocais(ausentes)
    localStorage.setItem(STORAGE_COFRE_LOCAL, JSON.stringify(b.cofre)) // só depois de persistir os dados
  })
  await entrarContaLocal(senha, b.perfil.perfil.apelido)
}
export function importarLedgerContaLocal(texto: string): Promise<void> {
  return serial(async () => {
    const a = autenticada(), recebido = lerLedgerLocal(texto), linha = await lerLinhaLocal(`ledger:${recebido.rede}`)
    let ledger = recebido
    if (linha) {
      const existente = lerLedgerLocal(linha.valor), n = Math.min(existente.elos.length, recebido.elos.length)
      for (let i = 0; i < n; i++) if (hashEloLocal(existente.elos[i]) !== hashEloLocal(recebido.elos[i])) throw new Error('Bifurcação no arquivo; importação recusada')
      if (existente.elos.length > recebido.elos.length) ledger = existente // nunca faz rollback
    }
    const dados = { ...a.dados, redeAtiva: ledger.rede }, cifra = await cifrarDadosConta(dados, a.chave, a.titular); atual(a.geracao)
    const [nova] = await gravarLinhasLocais([{ chave: `dados:${a.titular}`, esperado: revisaoDados, valor: canonicalizarV2(cifra) }, { chave: `ledger:${ledger.rede}`, esperado: linha?.revisao ?? 0, valor: canonicalizarV2(ledger) }])
    if (a.geracao === geracao) { revisaoDados = nova.revisao; publicar({ ...estado, dados, ledger }) }
  })
}
