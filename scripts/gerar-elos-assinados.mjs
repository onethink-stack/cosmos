import nacl from 'tweetnacl'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const raiz = new URL('../', import.meta.url)
const privado = new URL('privado/selo-502426c-ed25519.json', raiz)
const pin = new URL('src/dados/selo-publico.json', raiz)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hex = (bytes) => Buffer.from(bytes).toString('hex')
let par
if (existsSync(privado)) {
  const guardado = JSON.parse(readFileSync(privado, 'utf8'))
  par = nacl.sign.keyPair.fromSeed(Buffer.from(guardado.seed, 'hex'))
} else {
  if (existsSync(pin)) throw new Error('Chave privada ausente; não é permitido substituir a chave pública fixada.')
  par = nacl.sign.keyPair()
  mkdirSync(new URL('privado/', raiz), { recursive: true })
  writeFileSync(privado, JSON.stringify({ selo: '502426c', seed: hex(par.secretKey.slice(0, 32)) }) + '\n', { mode: 0o600, flag: 'wx' })
}
const pubkey = hex(par.publicKey)
if (existsSync(pin)) {
  if (JSON.parse(readFileSync(pin, 'utf8')).pubkey !== pubkey) throw new Error('A chave privada não corresponde ao selo fixado.')
} else writeFileSync(pin, JSON.stringify({ selo: '502426c', algoritmo: 'Ed25519', pubkey }, null, 2) + '\n', { flag: 'wx' })
const fases = ['cadeia-F0-F4.json', 'cadeia-outras-F5-F8.json'].flatMap((nome) => JSON.parse(readFileSync(new URL(`src/dados/${nome}`, raiz), 'utf8')).fases)
if (fases.map((f) => f.id).join(',') !== 'F0,F1,F2,F3,F4,F5,F6,F7,F8') throw new Error('Fases inesperadas.')
const elos_assinados = []
const elos = []
const autor = hash(par.publicKey)
let anterior = '0'.repeat(64)
for (const [indice, fase] of fases.entries()) {
  const { hash_teoria, ...outros } = fase
  if (hash(JSON.stringify(outros)) !== hash_teoria || fase.selo !== '502426c') throw new Error(`Metadados divergentes em ${fase.id}`)
  const assinatura = hex(nacl.sign.detached(new TextEncoder().encode(hash_teoria), par.secretKey))
  elos_assinados.push({ fase: fase.id, hash_teoria, assinatura, pubkey })
  const registroTexto = JSON.stringify({ autor, fase: fase.id, hash_teoria, selo: fase.selo })
  const texto = `cadeia-v1\nchave ${pubkey}\nindice ${indice}\nanterior ${anterior}\nregistro ${hash(registroTexto)}\n`
  elos.push({ indice, anterior, registroTexto, assinatura: hex(nacl.sign.detached(new TextEncoder().encode(texto), par.secretKey)) })
  anterior = hash(texto)
}
const resultado = { selo: '502426c', elos_assinados, cadeia: { formato: 'cadeia-v1', chave: pubkey, elos }, resumo_final: anterior }
const arquivoElos = new URL('src/dados/elos-assinados.json', raiz)
if (existsSync(arquivoElos)) {
  const anteriorPublicado = JSON.parse(readFileSync(arquivoElos, 'utf8'))
  const quantidade = anteriorPublicado.cadeia.elos.length
  if (JSON.stringify(anteriorPublicado.cadeia.elos) !== JSON.stringify(elos.slice(0, quantidade)) || JSON.stringify(anteriorPublicado.elos_assinados) !== JSON.stringify(elos_assinados.slice(0, quantidade))) throw new Error('Os elos já publicados não podem ser reescritos por esta extensão.')
}
writeFileSync(new URL('src/dados/elos-assinados.json', raiz), JSON.stringify(resultado, null, 2) + '\n')
par.secretKey.fill(0)
console.log('F0–F8: nove hashes assinados e cadeia-v1 gerada com a chave pública fixada; chave privada somente em privado/.')
