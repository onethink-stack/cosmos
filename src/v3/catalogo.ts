import { PACOTE_COSMOS } from '../dados/pacoteCosmos'

export const MODULOS_V3 = [
  { tela: 'notas', numero: '01', nome: 'Premissas', descricao: 'Registros públicos e origem das afirmações.', simbolo: '⊢', grupo: 'Conhecimento' },
  { tela: 'perguntar', numero: '02', nome: 'Perguntar', descricao: 'Encontre registros antes de formular uma nova pergunta.', simbolo: '?', grupo: 'Conhecimento' },
  { tela: 'dicionario', numero: '03', nome: 'Dicionário', descricao: 'Vocabulário, símbolos e versões semânticas.', simbolo: '∀', grupo: 'Conhecimento' },
  { tela: 'contradicoes', numero: '04', nome: 'Contradições', descricao: 'Separe conflito declarado de refutação conferida.', simbolo: '⊥', grupo: 'Verificação' },
  { tela: 'cadeia', numero: '05', nome: 'Cadeia pessoal', descricao: 'Nove fases históricas, hashes e assinaturas.', simbolo: '↗', grupo: 'Verificação' },
  { tela: 'mundo', numero: '06', nome: 'Mundo', descricao: 'Topologia da rede e critérios dos três nós.', simbolo: '◎', grupo: 'Rede' },
  { tela: 'verdades', numero: '07', nome: 'Evidências', descricao: 'Integridade não substitui prova da afirmação.', simbolo: '◇', grupo: 'Verificação' },
  { tela: 'cacar', numero: '08', nome: 'Caçar falhas', descricao: 'Cenários adversariais e critérios de recusa.', simbolo: '⌁', grupo: 'Verificação' },
  { tela: 'historico', numero: '09', nome: 'Histórico', descricao: 'Linha do tempo dos registros assinados.', simbolo: '↺', grupo: 'Rede' },
  { tela: 'backup', numero: '10', nome: 'Offline & backup', descricao: 'Exporte o pacote público sem acessar o cofre.', simbolo: '↓', grupo: 'Rede' },
  { tela: 'sistemas', numero: '11', nome: 'Sistemas', descricao: 'Estado dos componentes e integrações.', simbolo: '⊞', grupo: 'Rede' },
  { tela: 'certificados', numero: '12', nome: 'Certificados', descricao: 'Alethe + problema SMT-LIB; conferência independente.', simbolo: '✓', grupo: 'Verificação' },
] as const

export interface RegistroPublico {
  id: string; titulo: string; dominio: string; estado: string; hash: string; autor: string
}
/** Lista permitida de dados públicos. Não lê notas privadas, cofre ou IndexedDB. */
export const REGISTROS_PUBLICOS: readonly RegistroPublico[] = PACOTE_COSMOS.fases.map(fase => ({
  id: fase.id, titulo: fase.afirmacao, dominio: fase.dominio, estado: fase.estado,
  hash: fase.hash_teoria, autor: PACOTE_COSMOS.pubkey,
}))
export function pesquisarPublicos(consulta: string): RegistroPublico[] {
  const termos = consulta.normalize('NFC').toLocaleLowerCase('pt-BR').trim().split(/\s+/).filter(Boolean)
  return REGISTROS_PUBLICOS.filter(r => {
    const texto = [r.id, r.titulo, r.dominio, r.estado, r.hash, r.autor].join(' ').toLocaleLowerCase('pt-BR')
    return termos.every(t => texto.includes(t))
  })
}

/** Exemplos de interface, não ofertas publicadas, UTXOs ou moedas emitidas. */
export const OFERTAS_DEMO = [
  { id: 'DEMO-001', formula: 'φ ⊢ ψ', nome: 'Implicação entre proposições', dominio: 'Lógica proposicional', valor: '80', prazo: '14 dias', nivel: 'Alethe + Carcara' },
  { id: 'DEMO-002', formula: '∀x P(x) ⊢ P(a)', nome: 'Instanciação universal', dominio: 'Primeira ordem', valor: '50', prazo: '7 dias', nivel: 'Alethe + Carcara' },
  { id: 'DEMO-003', formula: '√2 × √2 = 2', nome: 'Identidade algébrica exata', dominio: 'Álgebra', valor: '120', prazo: '21 dias', nivel: 'Certificado requerido' },
] as const

export const TESTES_REDE = [
  { id: 'G01', nome: 'Fórmula alterada', criterio: 'Recusar hash/assinatura divergente, sem admissão parcial.' },
  { id: 'G02', nome: 'Pedido duplicado', criterio: 'Mesma operação é idempotente; conteúdo diferente é conflito.' },
  { id: 'G03', nome: 'Conclusão falsa', criterio: 'Recusar certificado que não confere contra o problema exato.' },
  { id: 'G04', nome: 'Nó desligado', criterio: 'Retorno do nó preserva prefixos e detecta lacunas.' },
  { id: 'G05', nome: 'Bifurcação', criterio: 'Dois elos no mesmo índice não são aceitos silenciosamente.' },
  { id: 'G06', nome: 'Três notebooks', criterio: 'Trocar arquivos e comparar o mesmo estado com âncora confiável.' },
] as const
