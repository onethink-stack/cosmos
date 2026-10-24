import { pesquisarPublicos } from '../v3/catalogo'
export const AXIOMAS_EXEMPLO = [
  { id: '001', nome: 'Induction', area: 'FOUNDATIONS', formula: '∀n (P(n) → P(n+1))', descricao: 'Base case P(0) + inductive step. Both are required.', dominio: 'Mathematics' },
  { id: '002', nome: 'Symmetry', area: 'THEORETICAL PHYSICS', formula: 'δS = 0  ⇒  ∂μjμ = 0', descricao: 'Noether · continuous symmetry, on-shell current conservation.', dominio: 'Physics' },
  { id: '003', nome: 'Conservation', area: 'ENERGY–MOMENTUM', formula: '∂μTμν = 0', descricao: 'Local energy–momentum conservation in flat spacetime.', dominio: 'Physics' },
] as const
/** Consulta determinística. Não chama LLM, não inventa fontes ou prova formal. */
export function consultarCatalogoLocal(pergunta: string): string {
  const texto = pergunta.trim().slice(0, 2000)
  const encontrados = pesquisarPublicos(texto)
  if (!encontrados.length) return 'Não encontrei esse conteúdo no catálogo local. Tente F0, F2, campo, pessoa ou um hash publicado. A conexão com o modelo I-AI e o diretório /comprovados/ ainda não está configurada; esta consulta não gera nem valida axiomas.'
  return `Encontrei ${encontrados.length} registro(s) no catálogo público local:\n\n` + encontrados.slice(0, 9).map(r => `${r.id} · ${r.titulo}\nDomínio: ${r.dominio} · estado declarado: ${r.estado}\nSHA-256: ${r.hash}`).join('\n\n') + '\n\nOrigem: fases históricas F0–F8 do projeto. Hash e autoria não comprovam a verdade do conteúdo. Nenhum modelo remoto foi consultado.'
}
/** Triagem limitada a literais simples. Não é um solver ou certificado. */
export function conflitosLiterais(formulas: string[]): string[] {
  const literais = new Set(formulas.map(f => f.replace(/\s/g, '')).filter(f => /^¬?[A-Za-zφψ]$/u.test(f)))
  return [...literais].filter(f => !f.startsWith('¬') && literais.has(`¬${f}`))
}
export interface Candle { open: number; close: number; high: number; low: number; volume: number }
export function candlesDemo(intervalo: string): Candle[] {
  const offset = intervalo === '1H' ? 0.7 : intervalo === '1W' ? 1.5 : 1
  const candles = Array.from({ length: 64 }, (_, i) => {
    const open = 17.3 + i * .031 * offset + Math.sin(i * .59) * .19 + Math.cos(i * .22) * .24
    const close = open + Math.sin(i * 1.71 + 1) * .15 + .039
    return { open, close, high: Math.max(open, close) + .045 + (i % 4) * .018, low: Math.min(open, close) - .05 - (i % 3) * .022, volume: 15 + (i * 13 % 51) }
  })
  const ajuste = 19.312 - candles.at(-1)!.close
  return candles.map(c => ({ ...c, open: c.open + ajuste, close: c.close + ajuste, high: c.high + ajuste, low: c.low + ajuste }))
}
export const BOOK_DEMO = Array.from({ length: 10 }, (_, i) => ({ ask: (19.314 + i * .002).toFixed(3), bid: (19.308 - i * .002).toFixed(3), size: (145.3 + (i * 237.17) % 1700).toFixed(2), depth: 12 + (i * 17 % 83) }))
export function niveisBookDemo(lado: 'ask' | 'bid') {
  let total = 0
  const niveis = BOOK_DEMO.slice(0, 7).map(r => {
    total += Number(r.size)
    return { ...r, preco: r[lado], total: total.toFixed(2) }
  })
  return lado === 'ask' ? niveis.reverse() : niveis
}
