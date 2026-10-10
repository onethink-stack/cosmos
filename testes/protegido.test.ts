import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { cifrar, decifrar, SenhaErrada } from '../src/dados/cripto'
import { _fecharParaTestes } from '../src/dados/db'
import { estado, notaVazia } from '../src/dados/estado'
import { preparar } from '../src/dados/premissas'
import { abrirSistema, carregarSistema, notasPresentes, removerSistema, type ConteudoSistema, type SistemaCifrado } from '../src/dados/sistemas'
import { OPCOES_PADRAO } from '../src/motor/motor'
import { executarTarefas, montarTarefas, type RespostaMotor } from '../src/motor/tarefas'

const SENHA = 'uma frase de teste bem comprida'

describe('criptografia', () => {
  it('ida e volta com a senha certa', async () => {
    const c = await cifrar('conteúdo secreto ∀x ∃y', SENHA, 1000)
    expect(c.dados).not.toContain('secreto')
    expect(await decifrar(c, SENHA)).toBe('conteúdo secreto ∀x ∃y')
  })

  it('senha errada e arquivo alterado são recusados', async () => {
    const c = await cifrar('conteúdo secreto', SENHA, 1000)
    await expect(decifrar(c, 'outra senha')).rejects.toBeInstanceOf(SenhaErrada)
    const adulterado = { ...c, dados: c.dados.slice(0, -4) + (c.dados.endsWith('AAAA') ? 'BBBB' : 'AAAA') }
    await expect(decifrar(adulterado, SENHA)).rejects.toBeInstanceOf(SenhaErrada)
  })

  it('cada cifragem usa sal e iv novos', async () => {
    const a = await cifrar('x', SENHA, 1000)
    const b = await cifrar('x', SENHA, 1000)
    expect(a.sal).not.toBe(b.sal)
    expect(a.dados).not.toBe(b.dados)
  })
})

const nota = (id: string, p: Partial<ConteudoSistema['notas'][number]>) => {
  const { criadaEm, atualizadaEm, ...resto } = notaVazia()
  void criadaEm
  void atualizadaEm
  return { ...resto, id: `teste-${id}`, ...p }
}

const CONTEUDO: ConteudoSistema = {
  id: 'teste',
  nome: 'Sistema de teste',
  descricao: 'só para testes',
  notas: [
    nota('L1', { titulo: 'regra', formulas: ['∀x (P(x) ⟹ Q(x))'] }),
    nota('L2', { titulo: 'fato', formulas: ['P(a)'] }),
    nota('T1', { titulo: 'teorema bom', compartimento: 'teorema', formulas: ['Q(a)'] }),
    nota('T2', { titulo: 'teorema ruim', compartimento: 'teorema', formulas: ['Q(b)'] }),
  ],
  dicionario: [
    { id: 'teste-P', simbolo: 'P', tipo: 'predicado', aridade: 1, termo: 'P', definicao: '' },
    { id: 'teste-Q', simbolo: 'Q', tipo: 'predicado', aridade: 1, termo: 'Q', definicao: '' },
    { id: 'teste-a', simbolo: 'a', tipo: 'constante', aridade: 0, termo: 'a', definicao: '' },
    { id: 'teste-b', simbolo: 'b', tipo: 'constante', aridade: 0, termo: 'b', definicao: '' },
  ],
}

async function cadernoNovo() {
  _fecharParaTestes()
  await new Promise<void>((ok) => {
    const r = indexedDB.deleteDatabase('caderno-logico')
    r.onsuccess = r.onerror = r.onblocked = () => ok()
  })
  await estado.carregar()
}

describe('sistema protegido no caderno', () => {
  beforeEach(cadernoNovo)

  it('abre com a senha, carrega sem duplicar, remove sem senha', async () => {
    const sc: SistemaCifrado = { id: 'teste', nome: 'Sistema de teste', ...(await cifrar(JSON.stringify(CONTEUDO), SENHA, 1000)) }
    await expect(abrirSistema(sc, 'errada')).rejects.toBeInstanceOf(SenhaErrada)
    const c = await abrirSistema(sc, SENHA)
    const minha = await estado.salvarNota({ ...notaVazia(), titulo: 'minha', formulas: ['R(c)'] })
    await carregarSistema(c)
    await carregarSistema(c)
    expect(notasPresentes('teste', estado.notas)).toHaveLength(4)
    expect(estado.notas).toHaveLength(5)
    await removerSistema('teste')
    expect(estado.notas.map((n) => n.id)).toEqual([minha.id])
  })
})

describe('teoremas', () => {
  const notas = CONTEUDO.notas.map((n) => ({ ...n, criadaEm: '2026-01-01', atualizadaEm: '2026-01-01' }))

  it('nunca entram como premissas', () => {
    const p = preparar(notas, CONTEUDO.dicionario)
    expect(p.premissas.map((f) => f.texto)).toEqual(['∀x (P(x) ⟹ Q(x))', 'P(a)'])
    expect(p.teoremas.map((f) => f.texto)).toEqual(['Q(a)', 'Q(b)'])
  })

  it('o motor confere cada teorema contra as leis e fatos', async () => {
    const { tarefas } = montarTarefas(notas, CONTEUDO.dicionario)
    const respostas: RespostaMotor[] = []
    await executarTarefas(
      {
        id: 1,
        tarefas: [tarefas[0]],
        dicionario: CONTEUDO.dicionario,
        opcoes: OPCOES_PADRAO,
        teoremas: [
          { id: 'bom', formula: 'Q(a)' },
          { id: 'ruim', formula: 'Q(b)' },
        ],
      },
      (r) => respostas.push(r),
    )
    const res = Object.fromEntries(respostas.filter((r) => r.tipo === 'teorema').map((r) => [r.teoremaId, r.resultado]))
    expect(res.bom).toMatchObject({ tipo: 'segue', notas: ['teste-L1', 'teste-L2'] })
    expect(res.ruim.tipo).toBe('nao-segue')
    expect(respostas.at(-1)!.tipo).toBe('fim')
  })
})
