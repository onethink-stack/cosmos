// Cifra e decifra conteúdo com senha, usando só a Web Crypto API (navegador e Node 22):
// chave = PBKDF2-SHA256(senha, sal, 600 000 iterações) → AES-256-GCM.
// O GCM autentica: senha errada ou arquivo alterado faz a decifragem falhar.
// Este arquivo não importa nada, para o script de cifragem poder usá-lo direto no Node.

export interface Cifrado {
  formato: 'caderno-cifrado'
  versao: 1
  iteracoes: number
  sal: string // base64
  iv: string // base64
  dados: string // base64 (texto cifrado + etiqueta GCM)
}

export const ITERACOES = 600_000

const b64 = (u: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
const deB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function chave(senha: string, sal: Uint8Array, iteracoes: number, uso: KeyUsage): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteracoes },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [uso],
  )
}

export async function cifrar(texto: string, senha: string, iteracoes = ITERACOES): Promise<Cifrado> {
  const sal = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const k = await chave(senha, sal, iteracoes, 'encrypt')
  const dados = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, k, new TextEncoder().encode(texto)))
  return { formato: 'caderno-cifrado', versao: 1, iteracoes, sal: b64(sal), iv: b64(iv), dados: b64(dados) }
}

export class SenhaErrada extends Error {
  constructor() {
    super('Senha incorreta.')
  }
}

/** Decifra; lança SenhaErrada se a senha não confere (ou o conteúdo foi alterado). */
export async function decifrar(c: Cifrado, senha: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle)
    throw new Error('Este navegador não oferece criptografia aqui. Abra o app pelo endereço https (ou instale o app).')
  const k = await chave(senha, deB64(c.sal), c.iteracoes, 'decrypt')
  try {
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(c.iv) as BufferSource }, k, deB64(c.dados) as BufferSource)
    return new TextDecoder().decode(claro)
  } catch {
    throw new SenhaErrada()
  }
}
