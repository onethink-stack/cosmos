// Armazém do motor de fundo: um arquivo SQLite fora da pasta do projeto
// (%LOCALAPPDATA%\CadernoLogico, ou CADERNO_DADOS). Guarda o banco de provas
// (o mesmo do app: o que já foi conferido não é refeito), as respostas do Z3
// e os trabalhos (o pedido e o que o motor foi respondendo), para continuar
// de onde parou se o PC ou o motor forem reiniciados.
//
// Cada thread (o motor e cada worker auxiliar) abre a sua conexão: o SQLite
// cuida de quem escreve ao mesmo tempo (modo WAL, espera até 10 s).

import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { BancoProvas, Prova } from '../src/motor/bancoProvas'

export function pastaDeDados(): string {
  const base = process.env.CADERNO_DADOS ?? join(process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), 'CadernoLogico')
  mkdirSync(base, { recursive: true })
  return base
}

export const arquivoPadrao = () => join(pastaDeDados(), 'motor-de-fundo.sqlite')

export function abrir(arquivo: string): DatabaseSync {
  const db = new DatabaseSync(arquivo)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 10000;
    CREATE TABLE IF NOT EXISTS provas (chave TEXT PRIMARY KEY, json TEXT NOT NULL, usado INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS z3 (chave TEXT PRIMARY KEY, resultado TEXT NOT NULL, ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS trabalhos (
      id TEXT PRIMARY KEY, pedido TEXT NOT NULL, inicio INTEGER NOT NULL, fim INTEGER,
      situacao TEXT NOT NULL, eventos TEXT NOT NULL, seq INTEGER NOT NULL, geracao INTEGER NOT NULL
    );
    -- o banco de verdades: os teoremas do gerador, com as leis de onde vêm (apoio:
    -- "nota~resumo das fórmulas", então o teorema só vale enquanto essas leis forem as mesmas)
    CREATE TABLE IF NOT EXISTS verdades (
      chave TEXT PRIMARY KEY, formula TEXT NOT NULL, peso INTEGER NOT NULL, prof INTEGER NOT NULL,
      apoio TEXT NOT NULL, pais TEXT NOT NULL, usos INTEGER NOT NULL DEFAULT 0, superado_por TEXT, criado INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  `)
  // as notas que a prova usou (núcleo): coluna nova num banco que já existia
  try {
    db.exec('ALTER TABLE z3 ADD COLUMN nucleo TEXT')
  } catch {
    /* já tem */
  }
  return db
}

/** quantas provas guardar (as usadas há mais tempo saem) */
const MAX_PROVAS = 2_000_000
/** `usado` só é regravado quando ficou velho (gravar a cada leitura custaria caro) */
const UM_DIA = 86_400_000

/** O banco de provas do motor (mesma interface do app), num SQLite. */
export function bancoSqlite(db: DatabaseSync): BancoProvas {
  const ler = db.prepare('SELECT json, usado FROM provas WHERE chave = ?')
  const gravar = db.prepare('INSERT OR REPLACE INTO provas (chave, json, usado) VALUES (?, ?, ?)')
  const tocar = db.prepare('UPDATE provas SET usado = ? WHERE chave = ?')
  const contar = db.prepare('SELECT COUNT(*) AS n FROM provas')
  const estatisticas = { entradas: Number((contar.get() as { n: number }).n), acertos: 0, parciais: 0, faltas: 0 }
  let gravadas = 0
  return {
    obter(chave) {
      const r = ler.get(chave) as { json: string; usado: number } | undefined
      if (!r) return undefined
      const agora = Date.now()
      if (agora - r.usado > UM_DIA) tocar.run(agora, chave)
      return JSON.parse(r.json) as Prova
    },
    guardar(p) {
      gravar.run(p.chave, JSON.stringify(p), Date.now())
      // de vez em quando: conta e, se passou do teto, tira as mais antigas
      if (++gravadas % 1000 === 0) {
        estatisticas.entradas = Number((contar.get() as { n: number }).n)
        if (estatisticas.entradas > MAX_PROVAS)
          db.prepare('DELETE FROM provas WHERE chave IN (SELECT chave FROM provas ORDER BY usado LIMIT ?)').run(Math.ceil(MAX_PROVAS / 10))
      } else estatisticas.entradas++
    },
    estatisticas,
    async limpar() {
      db.exec('DELETE FROM provas; DELETE FROM z3;')
      estatisticas.entradas = 0
    },
  }
}

/** Respostas do Z3 guardadas (sat/unsat; "não sei" não fica: pode dar certo com mais tempo). */
export function respostasZ3(db: DatabaseSync) {
  const ler = db.prepare('SELECT resultado, nucleo FROM z3 WHERE chave = ?')
  const gravar = db.prepare('INSERT OR REPLACE INTO z3 (chave, resultado, ms, nucleo) VALUES (?, ?, ?, ?)')
  return {
    obter: (chave: string): { resultado: 'sat' | 'unsat'; nucleo: number[] | null } | undefined => {
      const r = ler.get(chave) as { resultado: 'sat' | 'unsat'; nucleo: string | null } | undefined
      return r && { resultado: r.resultado, nucleo: r.nucleo ? (JSON.parse(r.nucleo) as number[]) : null }
    },
    guardar: (chave: string, resultado: 'sat' | 'unsat', ms: number, nucleo: number[] | null = null) =>
      void gravar.run(chave, resultado, ms, nucleo ? JSON.stringify(nucleo) : null),
  }
}
