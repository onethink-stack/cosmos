/** IndexedDB com compare-and-swap em transação readwrite. Sem rede. */
export interface LinhaLocal { chave: string; revisao: number; valor: string }
const DB = 'cosmos-conta-local-v1'
export function abrirBancoLocal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('itens', { keyPath: 'chave' })
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => db.close(); resolve(db) }
    r.onerror = () => reject(new Error('Armazenamento local indisponível'))
    r.onblocked = () => reject(new Error('Feche outras abas para atualizar o armazenamento'))
  })
}
export async function lerLinhaLocal(chave: string): Promise<LinhaLocal | null> {
  const db = await abrirBancoLocal()
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('itens', 'readonly'), r = tx.objectStore('itens').get(chave)
    r.onsuccess = () => resolve(r.result ?? null); r.onerror = () => reject(new Error('Falha na leitura local'))
  }) } finally { db.close() }
}
export async function gravarLinhaLocal(chave: string, esperado: number, valor: string): Promise<LinhaLocal> {
  return (await gravarLinhasLocais([{ chave, esperado, valor }]))[0]
}
export async function gravarLinhasLocais(itens: { chave: string; esperado: number; valor: string }[]): Promise<LinhaLocal[]> {
  if (!itens.length || new Set(itens.map(i => i.chave)).size !== itens.length || itens.some(i => i.valor.length > 262144 || !Number.isSafeInteger(i.esperado) || i.esperado < 0)) throw new Error('Gravação local inválida ou limite excedido')
  const db = await abrirBancoLocal()
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('itens', 'readwrite'), store = tx.objectStore('itens')
    const novos = itens.map(i => ({ chave: i.chave, revisao: i.esperado + 1, valor: i.valor }))
    let conflito = false
    let restantes = itens.length
    itens.forEach(i => {
      const r = store.get(i.chave)
      r.onsuccess = () => {
        if (conflito) return
        if ((r.result?.revisao ?? 0) !== i.esperado) { conflito = true; tx.abort(); return }
        if (!--restantes) novos.forEach(n => store.put(n))
      }
    })
    tx.oncomplete = () => resolve(novos)
    tx.onabort = () => reject(new Error(conflito ? 'Conflito entre abas: bloqueie e entre novamente para carregar a versão atual' : 'Gravação local recusada'))
    tx.onerror = () => { /* onabort fornece um erro sem conteúdo sensível. */ }
  }) } finally { db.close() }
}
