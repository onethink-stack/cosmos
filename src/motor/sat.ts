// SAT solver CDCL: literais vigiados, aprendizado 1-UIP com minimização
// recursiva da cláusula aprendida, VSIDS, salvamento de fase, reinícios de
// Luby e limpeza periódica das cláusulas aprendidas (fica a metade melhor,
// pela LBD — quantos níveis de decisão a cláusula liga —, e as de LBD ≤ 2
// ficam sempre). Entrada no estilo DIMACS: variáveis 1..n, literal ±v.

export type ResultadoSAT =
  | { sat: true; valores: Int8Array } // valores[v] = 1 (verdadeiro) ou -1 (falso)
  | { sat: false }
  | { sat: null } // limite de conflitos ou prazo atingido

export interface OpcoesSAT {
  maxConflitos?: number
  /** instante (Date.now()) em que desiste e devolve { sat: null } */
  prazo?: number
  /** se dado, recebe os números da busca (para medir) */
  estatisticas?: { conflitos: number; decisoes: number; aprendidas: number; limpezas: number }
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

/** primeira limpeza das aprendidas depois de tantos conflitos; cada uma seguinte vem um pouco mais tarde */
const PRIMEIRA_LIMPEZA = 2000
const AUMENTO_LIMPEZA = 300

export function resolver(nVars: number, entrada: number[][], opcoes: OpcoesSAT = {}): ResultadoSAT {
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
  /** cláusulas do problema (com 2 literais ou mais) */
  let originais: number[][] = []
  /** cláusulas aprendidas e a LBD de cada uma */
  let aprendidas: number[][] = []
  let lbds: number[] = []
  let conflitos = 0
  let decisoes = 0
  let limpezas = 0

  const fim = (r: ResultadoSAT): ResultadoSAT => {
    if (opcoes.estatisticas) Object.assign(opcoes.estatisticas, { conflitos, decisoes, aprendidas: aprendidas.length, limpezas })
    return r
  }

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
    if (c.length === 0) return fim({ sat: false })
    if (c.length === 1) {
      const x = val(c[0])
      if (x === -1) return fim({ sat: false })
      if (x === 0) atribuir(c[0], null)
      continue
    }
    originais.push(c)
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
  const pilha: number[] = []
  /** variáveis marcadas durante a minimização (para desmarcar no fim) */
  const marcadas: number[] = []
  const nivelAbstrato = (v: number) => 1 << (nivel[v] & 31)

  /**
   * O literal (falso) é redundante na cláusula aprendida se o motivo da sua
   * atribuição só usa literais que já estão na cláusula (ou que também são
   * redundantes, recursivamente). Assim a cláusula sai menor.
   */
  const redundante = (p: number, niveis: number): boolean => {
    pilha.length = 0
    pilha.push(p)
    const topo = marcadas.length
    while (pilha.length) {
      const c = razao[pilha.pop()! >> 1]!
      for (let k = 1; k < c.length; k++) {
        const v = c[k] >> 1
        if (visto[v] || nivel[v] === 0) continue
        if (razao[v] !== null && niveis & nivelAbstrato(v)) {
          visto[v] = 1
          pilha.push(c[k])
          marcadas.push(v)
        } else {
          for (let i = topo; i < marcadas.length; i++) visto[marcadas[i]] = 0
          marcadas.length = topo
          return false
        }
      }
    }
    return true
  }

  const carimbo = new Int32Array(nVars + 2)
  let carimboAtual = 0
  /** quantos níveis de decisão diferentes a cláusula liga */
  const lbdDe = (c: number[]) => {
    carimboAtual++
    let n = 0
    for (const l of c) {
      const nv = nivel[l >> 1]
      if (carimbo[nv] !== carimboAtual) {
        carimbo[nv] = carimboAtual
        n++
      }
    }
    return n
  }

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

    // minimização: tira os literais implicados pelos outros
    let niveis = 0
    for (let k = 1; k < aprendida.length; k++) niveis |= nivelAbstrato(aprendida[k] >> 1)
    marcadas.length = 0
    const antes = aprendida.slice(1)
    let j = 1
    for (const q of antes) if (razao[q >> 1] === null || !redundante(q, niveis)) aprendida[j++] = q
    aprendida.length = j
    for (const q of antes) visto[q >> 1] = 0
    for (const v of marcadas) visto[v] = 0

    let volta = 0
    if (aprendida.length > 1) {
      let m = 1
      for (let k = 2; k < aprendida.length; k++) if (nivel[aprendida[k] >> 1] > nivel[aprendida[m] >> 1]) m = k
      ;[aprendida[1], aprendida[m]] = [aprendida[m], aprendida[1]]
      volta = nivel[aprendida[1] >> 1]
    }
    return { aprendida, volta }
  }

  /**
   * Limpeza (no nível 0): sai a metade das aprendidas com LBD maior (as de
   * LBD ≤ 2 ficam), somem as cláusulas já satisfeitas para sempre e os
   * literais já falsos para sempre; as vigias são refeitas. Devolve false se
   * sobrar uma cláusula vazia (sem solução).
   */
  const limpar = (): boolean => {
    limpezas++
    const candidatas = aprendidas.map((_, i) => i).filter((i) => lbds[i] > 2)
    candidatas.sort((a, b) => lbds[b] - lbds[a] || b - a)
    const sai = new Uint8Array(aprendidas.length)
    for (const i of candidatas.slice(0, candidatas.length >> 1)) sai[i] = 1
    for (const w of vigias) w.length = 0
    const simplificar = (cs: number[][], manter: (i: number) => boolean, lbd?: number[]): [number[][], number[]] | null => {
      const novas: number[][] = []
      const novasLbd: number[] = []
      for (let i = 0; i < cs.length; i++) {
        if (!manter(i)) continue
        const c = cs[i]
        let satisfeita = false
        let k = 0
        for (const l of c) {
          const x = val(l)
          if (x === 1) {
            satisfeita = true
            break
          }
          if (x === 0) c[k++] = l
        }
        if (satisfeita) continue
        c.length = k
        if (k === 0) return null
        if (k === 1) {
          atribuir(c[0], null)
          continue
        }
        vigiar(c)
        novas.push(c)
        if (lbd) novasLbd.push(lbd[i])
      }
      return [novas, novasLbd]
    }
    const o = simplificar(originais, () => true)
    if (!o) return false
    const a = simplificar(aprendidas, (i) => !sai[i], lbds)
    if (!a) return false
    originais = o[0]
    ;[aprendidas, lbds] = a
    return true
  }

  // ---------- laço principal ----------
  if (propagar()) return fim({ sat: false })
  let reinicio = 0
  let limiteReinicio = 100 * luby(0)
  let conflitosDesdeReinicio = 0
  let proximaLimpeza = PRIMEIRA_LIMPEZA
  let intervaloLimpeza = PRIMEIRA_LIMPEZA

  for (;;) {
    const conflito = propagar()
    if (conflito) {
      conflitos++
      conflitosDesdeReinicio++
      if (limites.length === 0) return fim({ sat: false })
      const { aprendida, volta } = analisar(conflito)
      voltar(volta)
      if (aprendida.length === 1) atribuir(aprendida[0], null)
      else {
        aprendidas.push(aprendida)
        lbds.push(lbdDe(aprendida))
        vigiar(aprendida)
        atribuir(aprendida[0], aprendida)
      }
      incAtividade /= 0.95
      if (opcoes.maxConflitos && conflitos >= opcoes.maxConflitos) return fim({ sat: null })
      if (opcoes.prazo && (conflitos & 63) === 0 && Date.now() > opcoes.prazo) return fim({ sat: null })
      continue
    }
    if (conflitos >= proximaLimpeza) {
      intervaloLimpeza += AUMENTO_LIMPEZA
      proximaLimpeza = conflitos + intervaloLimpeza
      voltar(0)
      if (!limpar()) return fim({ sat: false })
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
      return fim({ sat: true, valores })
    }
    limites.push(trilha.length)
    if (opcoes.prazo && (++decisoes & 4095) === 0 && Date.now() > opcoes.prazo) return fim({ sat: null })
    atribuir(fase[v] === 1 ? 2 * v : 2 * v + 1, null)
  }
}
