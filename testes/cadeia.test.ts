// A cadeia pessoal (formato cadeia-v1, especificacao/cadeia-v1.md): a conferência do Caderno (src/motor/cadeia.ts) em
// cada exemplo de especificacao/cadeia-v1/exemplos.json, e uma simulação do critério da Fase 3: três notebooks, cada um
// com a sua chave do WebCrypto (que não se exporta), trocam cadeias como texto, e cada um acusa qualquer alteração.
import { describe, expect, it } from 'vitest'
import { compararVersoes, conferirCadeia, conferirCadeiaTexto, FORMATO_CADEIA, novoElo, paraHex, ZEROS, type Cadeia } from '../src/motor/cadeiaPessoal'
import { sha256 } from '../src/motor/registro'
import textoExemplos from './fixtures/cadeia-v1-exemplos.json?raw'

const { exemplos, versoes } = JSON.parse(textoExemplos)

describe('os exemplos de cadeia-v1', () => {
  it('cada cadeia dá o veredito esperado, com o código e o elo do defeito, e o resumo nas aceitas', async () => {
    expect(exemplos.length).toBeGreaterThan(20)
    for (const e of exemplos) {
      const c = e.cadeiaTexto !== undefined ? await conferirCadeiaTexto(e.cadeiaTexto) : await conferirCadeia(e.cadeia)
      expect([c.veredito, c.motivo, c.elo], `${e.id}: ${c.detalhe}`).toEqual([e.esperado.veredito, e.esperado.motivo ?? null, e.esperado.elo ?? null])
      if (c.veredito === 'aceita') expect([c.resumos.length, c.cabeca], e.id).toEqual([e.esperado.elos, e.esperado.cabeca])
    }
  })

  it('cada par de versões dá a relação esperada', async () => {
    for (const v of versoes) {
      const [a, b] = [await conferirCadeia(v.antiga), await conferirCadeia(v.nova)]
      expect([a.veredito, b.veredito], v.id).toEqual(['aceita', 'aceita'])
      const r = compararVersoes({ chave: v.antiga.chave, resumos: a.resumos }, { chave: v.nova.chave, resumos: b.resumos })
      expect(r, v.id).toEqual({ relacao: v.esperado.relacao, elo: v.esperado.elo ?? null })
    }
  })
})

/** um notebook: a chave do WebCrypto, que não se exporta, a cadeia dele e as cadeias que ele já recebeu */
class Notebook {
  private constructor(
    private readonly chave: CryptoKeyPair,
    readonly publica: string,
    readonly cadeia: Cadeia,
    private readonly recebidas = new Map<string, { resumos: string[] }>(),
    private ultimo = ZEROS,
  ) {}
  static async novo(): Promise<Notebook> {
    const chave = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair
    expect(chave.privateKey.extractable).toBe(false)
    const publica = paraHex(new Uint8Array(await crypto.subtle.exportKey('raw', chave.publicKey)))
    return new Notebook(chave, publica, { formato: FORMATO_CADEIA, chave: publica, elos: [] })
  }
  /** acrescenta um registro (fechado, com o autor desta chave) à própria cadeia */
  async registrar(n: number) {
    const registro = {
      formato: 'registro-v1',
      situacao: 'fechado',
      afirmacao: 'consistente',
      teoria: { nome: `teoria ${n}`, hash: await sha256(`teoria ${n}`) },
      tipo: 'hipótese',
      dominio: 'simulação de três notebooks',
      estado: 'proposta',
      semantica: { gramatica: 'm2', traducao: 't1' },
      autor: await sha256(Uint8Array.from(this.publica.match(/../g)!, (h) => parseInt(h, 16))),
      compromisso: { hash: await sha256(`fórmula ${n}`) },
    }
    const assinar = async (m: Uint8Array) => new Uint8Array(await crypto.subtle.sign('Ed25519', this.chave.privateKey, new Uint8Array(m)))
    const { elo, resumo } = await novoElo(this.publica, this.cadeia.elos.length, this.ultimo, JSON.stringify(registro), assinar)
    this.cadeia.elos.push(elo)
    this.ultimo = resumo
  }
  /** volta a própria cadeia para os primeiros n elos: para cortar o fim, ou para reescrever a história com a mesma chave */
  async voltar(n: number) {
    this.cadeia.elos.splice(n)
    this.ultimo = n ? (await conferirCadeia(this.cadeia)).cabeca! : ZEROS
  }
  /** o arquivo que vai para os outros */
  exportar = () => JSON.stringify(this.cadeia)
  /** recebe um arquivo: confere, compara com a versão que já tinha e diz o que achou */
  async receber(texto: string): Promise<string> {
    const c = await conferirCadeiaTexto(texto)
    if (c.veredito === 'recusada') return `recusada ${c.motivo}${c.elo === null ? '' : ` no elo ${c.elo}`}`
    const chave = JSON.parse(texto).chave as string
    const antes = this.recebidas.get(chave)
    const relacao = antes ? compararVersoes({ chave, resumos: antes.resumos }, { chave, resumos: c.resumos }).relacao : 'nova'
    // só a primeira versão, a igual e a extensão substituem a guardada; as outras ficam como prova
    if (relacao === 'nova' || relacao === 'extensao') this.recebidas.set(chave, { resumos: c.resumos })
    return relacao
  }
}

describe('três notebooks trocam cadeias por arquivo', () => {
  it('cada um aceita as cadeias dos outros e acusa qualquer alteração', async () => {
    const [a, b, c] = [await Notebook.novo(), await Notebook.novo(), await Notebook.novo()]
    for (const [i, n] of [a, b, c].entries()) for (let k = 0; k < 3; k++) await n.registrar(10 * i + k)
    // a primeira troca: cada um recebe as dos outros
    for (const n of [a, b, c]) for (const outro of [a, b, c]) if (outro !== n) expect(await n.receber(outro.exportar())).toBe('nova')
    // a cresce: os outros aceitam a extensão; o mesmo arquivo de novo é igual
    await a.registrar(3)
    const crescida = a.exportar()
    expect([await b.receber(crescida), await c.receber(crescida), await c.receber(crescida)]).toEqual(['extensao', 'extensao', 'igual'])

    // alterações no caminho: um registro mudado, um elo tirado, a assinatura de outro elo, outra chave na cadeia
    const mexer = (f: (x: Cadeia) => void) => {
      const x = JSON.parse(crescida) as Cadeia
      f(x)
      return JSON.stringify(x)
    }
    expect(await b.receber(mexer((x) => (x.elos[1].registroTexto = x.elos[1].registroTexto.replace('proposta', 'refutada'))))).toBe('recusada C8 no elo 1')
    expect(await b.receber(mexer((x) => x.elos.splice(2, 1)))).toBe('recusada C4 no elo 2')
    expect(await b.receber(mexer((x) => (x.elos[3].assinatura = x.elos[2].assinatura)))).toBe('recusada C8 no elo 3')
    expect(await b.receber(mexer((x) => (x.chave = c.publica)))).toBe('recusada C7 no elo 0')
    expect(await c.receber(mexer((x) => (x.elos[0].anterior = x.elos[1].anterior)))).toBe('recusada C5 no elo 0')

    // a própria a corta o fim: a cadeia vale sozinha, mas quem tinha a versão maior acusa
    await a.voltar(3)
    expect([await b.receber(a.exportar()), await c.receber(a.exportar())]).toEqual(['encurtada', 'encurtada'])

    // a própria a reescreve a história desde o elo 1 e assina de novo: quem tinha a antiga acusa a bifurcação
    await a.voltar(1)
    for (const k of [77, 78, 79]) await a.registrar(k)
    expect((await conferirCadeiaTexto(a.exportar())).veredito).toBe('aceita')
    expect([await b.receber(a.exportar()), await c.receber(a.exportar())]).toEqual(['bifurcada', 'bifurcada'])
    // e um notebook que nunca viu a versão antiga não tem como saber (o limite 2 da seção 8)
    const d = await Notebook.novo()
    expect(await d.receber(a.exportar())).toBe('nova')
  })
})
