// IndexedDB mínimo: três lojas, tudo carregado em memória na abertura.

const NOME_BANCO = 'caderno-logico'
const VERSAO = 1

export type Loja = 'notas' | 'dicionario' | 'config'

let banco: Promise<IDBDatabase> | null = null

export function abrir(): Promise<IDBDatabase> {
  if (banco) return banco
  banco = new Promise((ok, falha) => {
    const r = indexedDB.open(NOME_BANCO, VERSAO)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains('notas')) db.createObjectStore('notas', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('dicionario')) db.createObjectStore('dicionario', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'chave' })
    }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => falha(r.error)
    r.onblocked = () => falha(new Error('Banco bloqueado por outra aba aberta'))
  })
  banco.catch(() => (banco = null))
  return banco
}

function concluir(tx: IDBTransaction): Promise<void> {
  return new Promise((ok, falha) => {
    tx.oncomplete = () => ok()
    tx.onerror = () => falha(tx.error)
    tx.onabort = () => falha(tx.error ?? new Error('Transação abortada'))
  })
}

export async function listar<T>(loja: Loja): Promise<T[]> {
  const db = await abrir()
  return new Promise((ok, falha) => {
    const r = db.transaction(loja, 'readonly').objectStore(loja).getAll()
    r.onsuccess = () => ok(r.result as T[])
    r.onerror = () => falha(r.error)
  })
}

export async function gravar<T>(loja: Loja, ...objs: T[]): Promise<void> {
  const db = await abrir()
  const tx = db.transaction(loja, 'readwrite')
  const s = tx.objectStore(loja)
  for (const o of objs) s.put(o)
  return concluir(tx)
}

export async function apagar(loja: Loja, id: string): Promise<void> {
  const db = await abrir()
  const tx = db.transaction(loja, 'readwrite')
  tx.objectStore(loja).delete(id)
  return concluir(tx)
}

/** Substitui todo o conteúdo das lojas indicadas (usado na importação). */
export async function substituirTudo(dados: Partial<Record<Loja, unknown[]>>): Promise<void> {
  const db = await abrir()
  const lojas = Object.keys(dados) as Loja[]
  const tx = db.transaction(lojas, 'readwrite')
  for (const l of lojas) {
    const s = tx.objectStore(l)
    s.clear()
    for (const o of dados[l]!) s.put(o)
  }
  return concluir(tx)
}

export async function lerConfig<T>(chave: string): Promise<T | undefined> {
  const db = await abrir()
  return new Promise((ok, falha) => {
    const r = db.transaction('config', 'readonly').objectStore('config').get(chave)
    r.onsuccess = () => ok((r.result as { valor: T } | undefined)?.valor)
    r.onerror = () => falha(r.error)
  })
}

export function gravarConfig<T>(chave: string, valor: T): Promise<void> {
  return gravar('config', { chave, valor })
}

/** Só para testes: esquece a conexão aberta. */
export function _fecharParaTestes() {
  void banco?.then((db) => db.close())
  banco = null
}
