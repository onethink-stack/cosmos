import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const fase = (id, pessoa, testemunha, campo, situacao, afirmacao, tipo, dominio, estado) => {
  const dados = { id, pessoa, testemunha, campo, selo: '502426c', situacao, afirmacao, tipo, dominio, estado, gramatica: 'm2', traducao: 't1' }
  return { ...dados, hash_teoria: createHash('sha256').update(JSON.stringify(dados), 'utf8').digest('hex') }
}
const campo = (a) => ({ a, b: 1, repr: `${a} + 1√2` })
const testemunhas = ['Z35', 'Z39']
const fases = [
  fase('F0', null, [], null, 'aberto', 'hipotese', 'cadeia pessoal', 'cosmos', 'proposta'),
  fase('F1', 'pessoa(φ)', [], null, 'aberto', 'definicao', 'definicao', 'pessoa', 'proposta'),
  fase('F2', 'pessoa(φ)', testemunhas, campo(0), 'aberto', 'teorema', 'teorema', 'campo', 'corrobora'),
  fase('F3', 'pessoa(φ)', testemunhas, campo(1), 'fechado', 'evidencia', 'evidencia', 'testemunha', 'corroborada'),
  fase('F4', 'pessoa(φ)', testemunhas, campo(2), 'fechado', 'fechamento', 'fechamento', 'selo', 'segue'),
]
const outras = [
  fase('F5', null, testemunhas, { a: 3, b: 1 }, 'fechado', 'entrega', 'entrega', 'entrega', 'entregue'),
  fase('F6', null, testemunhas, null, 'aberto', 'multi-pessoa', 'multi-pessoa', 'pessoas', 'proposta'),
  fase('F7', null, [], null, 'aberto', 'verificar selo puro', 'verificacao', 'selo', 'proposta'),
  fase('F8', null, [], null, 'aberto', 'publicar IPFS', 'publicacao', 'IPFS', 'proposta'),
]
for (const [nome, lista] of [['cadeia-F0-F4.json', fases], ['cadeia-outras-F5-F8.json', outras]]) {
  writeFileSync(new URL(`../src/dados/${nome}`, import.meta.url), JSON.stringify({ formato: 'cadeia-v1', descricao: nome.startsWith('cadeia-outras') ? 'Etapas adicionais F5-F8; IPFS pendente' : 'Cadeia Cosmos F0-F4 com coeficientes exatos', selo: '502426c', fases: lista }, null, 2) + '\n')
}
