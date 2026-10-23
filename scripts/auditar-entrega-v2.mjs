// Diagnóstico local, sem iniciar HTTP, publicar ou modificar dados v1.
import { createServer } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const root = new URL('../', import.meta.url)
const ler = async (nome) => JSON.parse(await readFile(new URL(nome, root), 'utf8'))
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' })
try {
  const { canonicalizarV2 } = await server.ssrLoadModule('/src/v2/canonico.ts')
  const merkle = await server.ssrLoadModule('/src/v2/transparencia.ts')
  const { conferirElosCosmos } = await server.ssrLoadModule('/src/motor/elosCosmos.ts')
  const { PACOTE_COSMOS } = await server.ssrLoadModule('/src/dados/pacoteCosmos.ts')
  const checkpoint = await ler('public/cosmos-checkpoint-v1.json')
  const folhas = PACOTE_COSMOS.cadeia.elos.map((elo) => elo.registroTexto)
  const inclusoes = await Promise.all(checkpoint.inclusao.map(({ indice, prova }) =>
    merkle.verificarInclusao(folhas[indice], indice, folhas.length, prova, checkpoint.checkpoint.raiz)))
  const continuidades = await Promise.all(checkpoint.continuidade.map(({ anterior, prova }) =>
    merkle.verificarConsistencia(anterior.tamanho, folhas.length, anterior.raiz, checkpoint.checkpoint.raiz, prova)))

  let chamadasGetter = 0
  const comGetter = []
  Object.defineProperty(comGetter, '0', { enumerable: true, get() { chamadasGetter++; return 1 } })
  const esparso = new Array(1)
  esparso.extra = 1
  const observar = (fn) => { try { return { aceito: true, valor: fn() } } catch (e) { return { aceito: false, erro: e.message } } }
  const accessor = observar(() => canonicalizarV2(comGetter))
  const esparsoComExtra = observar(() => canonicalizarV2(esparso))
  const zeros = '0'.repeat(64)
  const arquivos = [
    'src/dados/cadeia-F0-F4.json', 'src/dados/cadeia-outras-F5-F8.json',
    'src/dados/elos-assinados.json', 'src/dados/selo-publico.json', 'dist/cosmos-502426c.json',
  ]
  const hashes = Object.fromEntries(await Promise.all(arquivos.map(async (nome) => [nome, sha(await readFile(new URL(nome, root)))])))
  const resultado = {
    escopo: 'diagnostico local; nao substitui suite de testes ou auditoria independente',
    envelopeV1: await conferirElosCosmos(PACOTE_COSMOS, PACOTE_COSMOS.fases),
    checkpoint: { raizCalculada: await merkle.raizMerkle(folhas), raizArquivo: checkpoint.checkpoint.raiz,
      folhas: folhas.length, inclusoesValidas: inclusoes.filter(Boolean).length, continuidadesValidas: continuidades.filter(Boolean).length },
    achados: {
      arrayAccessor: { ...accessor, chamadasGetter },
      arrayEsparsoComExtra: { ...esparsoComExtra, tamanhoOriginal: esparso.length, chavesOriginais: Object.keys(esparso) },
      consistenciaVazia: { raizVaziaCorreta: sha(new Uint8Array()), raizIncorretaUsada: zeros,
        aceitaRaizesIncorretas: await merkle.verificarConsistencia(0, 0, zeros, zeros, []) },
    },
    hashes,
  }
  const saida = process.argv.includes('--apos-patch')
    ? 'evidencias/revisao-v2-diagnostico-apos-patch.json'
    : 'evidencias/revisao-v2-diagnostico.json'
  await writeFile(new URL(saida, root), JSON.stringify(resultado, null, 2) + '\n')
  console.log(JSON.stringify(resultado, null, 2))
} finally {
  await server.close()
}
