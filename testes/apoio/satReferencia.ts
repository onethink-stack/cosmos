// Cópia do resolvedor SAT anterior (sem limpeza nem minimização), usada só
// nos testes como referência para conferir o atual.
/* eslint-disable */

export type ResultadoSAT =
  | { sat: true; valores: Int8Array } // valores[v] = 1 (verdadeiro) ou -1 (falso)
  | { sat: false }
  | { sat: null } // limite de conflitos ou prazo atingido

export interface OpcoesSAT {
  maxConflitos?: number
  /** instante (Date.now()) em que desiste e devolve { sat: null } */
  prazo?: number
}

// Internamente um literal é 2v (positivo) ou 2v+1 (negativo).
const lit = (l: number) => (l > 0 ? 2 * l : -2 * l + 1)

function luby(i: number): number {
  let tam = 1
  let seq = 0
  while (tam < i + 1) {
    seq++
    tam = 2 * tam + 1
  }
  while (tam - 1 !== i) {
    tam = (tam - 1) >> 1
    seq--
    i = i % tam
  }
  return 2 ** seq
}

export function resolverReferencia(nVars: number, entrada: number[][], opcoes: OpcoesSAT = {}): ResultadoSAT {
  const valor = new Int8Array(nVars + 1) // 0 livre, 1 V, -1 F
  const nivel = new Int32Array(nVars + 1)
  const razao: (number[] | null)[] = new Array(nVars + 1).fill(null)
  const fase = new Int8Array(nVars + 1).fill(-1)
  const atividade = new Float64Array(nVars + 1)
  let incAtividade = 1
  const vigias: number[][][] = Array.from({ length: 2 * nVars + 2 }, () => [])
  const trilha: number[] = []
  const limites: number[] = [] // início de cada nível de decisão na trilha
  let cabeca = 0

  // valor de um literal interno: 1, -1 ou 0
  const val = (l: number) => {
    const v = valor[l >> 1]
    return l & 1 ? -v : v
  }

  // ---------- heap de variáveis por atividade ----------
  const heap: number[] = []
  const posHeap = new Int32Array(nVars + 1).fill(-1)
  const sobe = (i: number) => {
    const v = heap[i]
    while (i > 0) {
      const p = (i - 1) >> 1
      if (atividade[heap[p]] >= atividade[v]) break
      heap[i] = heap[p]
      posHeap[heap[i]] = i
      i = p
    }
    heap[i] = v
    posHeap[v] = i
  }
  const desce = (i: number) => {
    const v = heap[i]
    const n = heap.length
    for (;;) {
      let f = 2 * i + 1
      if (f >= n) break
      if (f + 1 < n && atividade[heap[f + 1]] > atividade[heap[f]]) f++
      if (atividade[heap[f]] <= atividade[v]) break
      heap[i] = heap[f]
      posHeap[heap[i]] = i
      i = f
    }
    heap[i] = v
    posHeap[v] = i
  }
  const inserir = (v: number) => {
    if (posHeap[v] >= 0) return
    heap.push(v)
    sobe(heap.length - 1)
  }
  const retirarMaior = (): number => {
    const v = heap[0]
    const ult = heap.pop()!
    posHeap[v] = -1
    if (heap.length) {
      heap[0] = ult
      posHeap[ult] = 0
      desce(0)
    }
    return v
  }
  const reforcar = (v: number) => {
    atividade[v] += incAtividade
    if (atividade[v] > 1e100) {
      for (let i = 1; i <= nVars; i++) atividade[i] *= 1e-100
      incAtividade *= 1e-100
    }
    if (posHeap[v] >= 0) sobe(posHeap[v])
  }

  // ---------- atribuição ----------
  const atribuir = (l: number, r: number[] | null) => {
    const v = l >> 1
    valor[v] = l & 1 ? -1 : 1
    nivel[v] = limites.length
    razao[v] = r
    trilha.push(l)
  }

  const voltar = (nv: number) => {
    if (limites.length <= nv) return
    const ini = limites[nv]
    for (let i = trilha.length - 1; i >= ini; i--) {
      const v = trilha[i] >> 1
      fase[v] = valor[v]
      valor[v] = 0
      razao[v] = null
      inserir(v)
    }
    trilha.length = ini
    limites.length = nv
    cabeca = ini
  }

  const vigiar = (c: number[]) => {
    vigias[c[0]].push(c)
    vigias[c[1]].push(c)
  }

  // ---------- carga das cláusulas ----------
  for (const bruta of entrada) {
    const vistos = new Set<number>()
    let tautologia = false
    for (const l of bruta) {
      if (vistos.has(-l)) tautologia = true
      vistos.add(l)
    }
    if (tautologia) continue
    const c = [...vistos].map(lit)
    if (c.length === 0) return { sat: false }
    if (c.length === 1) {
      const x = val(c[0])
      if (x === -1) return { sat: false }
      if (x === 0) atribuir(c[0], null)
      continue
    }
    vigiar(c)
  }
  for (let v = 1; v <= nVars; v++) inserir(v)

  // ---------- propagação de unidade ----------
  const propagar = (): number[] | null => {
    while (cabeca < trilha.length) {
      const p = trilha[cabeca++]
      const falso = p ^ 1
      const ws = vigias[falso]
      let i = 0
      let j = 0
      while (i < ws.length) {
        const c = ws[i++]
        if (c[0] === falso) {
          c[0] = c[1]
          c[1] = falso
        }
        if (val(c[0]) === 1) {
          ws[j++] = c
          continue
        }
        let achou = false
        for (let k = 2; k < c.length; k++) {
          if (val(c[k]) !== -1) {
            c[1] = c[k]
            c[k] = falso
            vigias[c[1]].push(c)
            achou = true
            break
          }
        }
        if (achou) continue
        ws[j++] = c
        if (val(c[0]) === -1) {
          while (i < ws.length) ws[j++] = ws[i++]
          ws.length = j
          return c
        }
        atribuir(c[0], c)
      }
      ws.length = j
    }
    return null
  }

  // ---------- análise de conflito (1-UIP) ----------
  const visto = new Uint8Array(nVars + 1)
  const analisar = (conflito: number[]): { aprendida: number[]; volta: number } => {
    const aprendida: number[] = [0]
    let caminho = 0
    let p = -1
    let idx = trilha.length - 1
    let c: number[] = conflito
    const nivelAtual = limites.length
    do {
      for (let k = p === -1 ? 0 : 1; k < c.length; k++) {
        const q = c[k]
        const v = q >> 1
        if (!visto[v] && nivel[v] > 0) {
          visto[v] = 1
          reforcar(v)
          if (nivel[v] >= nivelAtual) caminho++
          else aprendida.push(q)
        }
      }
      while (!visto[trilha[idx] >> 1]) idx--
      p = trilha[idx--]
      c = razao[p >> 1]!
      visto[p >> 1] = 0
      caminho--
    } while (caminho > 0)
    aprendida[0] = p ^ 1
    for (let k = 1; k < aprendida.length; k++) visto[aprendida[k] >> 1] = 0

    let volta = 0
    if (aprendida.length > 1) {
      let m = 1
      for (let k = 2; k < aprendida.length; k++) if (nivel[aprendida[k] >> 1] > nivel[aprendida[m] >> 1]) m = k
      ;[aprendida[1], aprendida[m]] = [aprendida[m], aprendida[1]]
      volta = nivel[aprendida[1] >> 1]
    }
    return { aprendida, volta }
  }

  // ---------- laço principal ----------
  if (propagar()) return { sat: false }
  let conflitos = 0
  let reinicio = 0
  let limiteReinicio = 100 * luby(0)
  let conflitosDesdeReinicio = 0
  let decisoes = 0

  for (;;) {
    const conflito = propagar()
    if (conflito) {
      conflitos++
      conflitosDesdeReinicio++
      if (limites.length === 0) return { sat: false }
      const { aprendida, volta } = analisar(conflito)
      voltar(volta)
      if (aprendida.length === 1) atribuir(aprendida[0], null)
      else {
        vigiar(aprendida)
        atribuir(aprendida[0], aprendida)
      }
      incAtividade /= 0.95
      if (opcoes.maxConflitos && conflitos >= opcoes.maxConflitos) return { sat: null }
      if (opcoes.prazo && (conflitos & 63) === 0 && Date.now() > opcoes.prazo) return { sat: null }
      continue
    }
    if (conflitosDesdeReinicio >= limiteReinicio) {
      reinicio++
      limiteReinicio = 100 * luby(reinicio)
      conflitosDesdeReinicio = 0
      voltar(0)
      continue
    }
    // decisão
    let v = 0
    while (heap.length) {
      const x = retirarMaior()
      if (valor[x] === 0) {
        v = x
        break
      }
    }
    if (!v) {
      const valores = new Int8Array(nVars + 1)
      for (let i = 1; i <= nVars; i++) valores[i] = valor[i] || -1
      return { sat: true, valores }
    }
    limites.push(trilha.length)
    if (opcoes.prazo && (++decisoes & 4095) === 0 && Date.now() > opcoes.prazo) return { sat: null }
    atribuir(fase[v] === 1 ? 2 * v : 2 * v + 1, null)
  }
}
