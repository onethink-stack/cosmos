import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { canonicalizarV2, lerCanonicoV2, FORMATO_V2 } from './canonico'
import { conferirAssinatura } from '../motor/ed25519'
import { ObjetosReplicados, sha256Bytes } from './objetos-node'

const HEX=/^[a-f0-9]{64}$/
export class ErroAdmissao extends Error { constructor(readonly codigo:number, message:string){super(message)} }
export interface RegistroV2 { formato:typeof FORMATO_V2; autor:string; indice:number; anterior:string; pedido:string; conteudo:unknown; evidencias:string[] }
export interface EnvelopeV2 { registro:RegistroV2; assinatura:string }
export interface ExportacaoV2 { formato:'cosmos-export-v2'; autor:string; elos:EnvelopeV2[] }
const exact=(o:Record<string,unknown>,keys:string[])=>Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k))
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
export class LedgerV2 {
  private db:DatabaseSync
  readonly evidencias:ObjetosReplicados
  constructor(file:string,replicas?:string[]){
    mkdirSync(dirname(file),{recursive:true})
    this.evidencias=new ObjetosReplicados(replicas??[join(dirname(file),'objetos-A'),join(dirname(file),'objetos-B')])
    this.db=new DatabaseSync(file)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS elos(autor TEXT NOT NULL, indice INTEGER NOT NULL, hash TEXT NOT NULL UNIQUE,
        anterior TEXT NOT NULL, pedido TEXT NOT NULL, envelope TEXT NOT NULL, objeto TEXT NOT NULL,
        PRIMARY KEY(autor,indice), UNIQUE(autor,pedido));
      CREATE TRIGGER IF NOT EXISTS sem_update BEFORE UPDATE ON elos BEGIN SELECT RAISE(ABORT,'append-only'); END;
      CREATE TRIGGER IF NOT EXISTS sem_delete BEFORE DELETE ON elos BEGIN SELECT RAISE(ABORT,'append-only'); END;`)
  }
  async admitir(texto:string):Promise<{hash:string;duplicado:boolean}>{
    const e=lerCanonicoV2(texto)
    if(!obj(e)||!exact(e,['registro','assinatura'])||!obj(e.registro))throw new ErroAdmissao(400,'Envelope v2 inválido')
    const r=e.registro
    if(!exact(r,['formato','autor','indice','anterior','pedido','conteudo','evidencias'])||r.formato!==FORMATO_V2||typeof r.autor!=='string'||!HEX.test(r.autor)||typeof r.anterior!=='string'||!HEX.test(r.anterior)||!Number.isSafeInteger(r.indice)||(r.indice as number)<0||typeof r.pedido!=='string'||!/^[a-zA-Z0-9._:-]{1,128}$/.test(r.pedido)||!Array.isArray(r.evidencias)||r.evidencias.length>32||r.evidencias.some(h=>typeof h!=='string'||!HEX.test(h))||typeof e.assinatura!=='string'||!/^[a-f0-9]{128}$/.test(e.assinatura))throw new ErroAdmissao(400,'Campos de registro v2 inválidos')
    const message=FORMATO_V2+'\n'+canonicalizarV2(r)
    const valid=await conferirAssinatura(Buffer.from(r.autor,'hex'),new TextEncoder().encode(message),Buffer.from(e.assinatura,'hex'))
    if(!valid)throw new ErroAdmissao(401,'Assinatura de admissão inválida')
    for(const h of r.evidencias as string[])this.evidencias.ler(h)
    const hash=sha256Bytes(message)
    this.db.exec('BEGIN IMMEDIATE')
    try{
      const prior=this.db.prepare('SELECT hash FROM elos WHERE autor=? AND pedido=?').get(r.autor,r.pedido) as {hash:string}|undefined
      if(prior){
        if(prior.hash!==hash)throw new ErroAdmissao(409,'Idempotência reutilizada com conteúdo diferente')
        this.db.exec('COMMIT');return{hash,duplicado:true}
      }
      const same=this.db.prepare('SELECT hash FROM elos WHERE autor=? AND indice=?').get(r.autor,r.indice as number)
      if(same)throw new ErroAdmissao(409,'Bifurcação: índice já ocupado por outro elo')
      const head=this.db.prepare('SELECT indice,hash FROM elos WHERE autor=? ORDER BY indice DESC LIMIT 1').get(r.autor) as {indice:number;hash:string}|undefined
      if(r.indice!==(head?head.indice+1:0)||r.anterior!==(head?head.hash:'0'.repeat(64)))throw new ErroAdmissao(409,'Lacuna, rollback ou anterior divergente')
      // Recusas de fork/idempotência não gravam objetos. Falha de I/O/commit
      // ainda pode deixar objeto órfão, jamais um elo aceito sem suas réplicas.
      const objeto=this.evidencias.gravar(Buffer.from(texto))
      this.db.prepare('INSERT INTO elos VALUES (?,?,?,?,?,?,?)').run(r.autor,r.indice as number,hash,r.anterior,r.pedido,texto,objeto)
      this.db.exec('COMMIT')
      return{hash,duplicado:false}
    }catch(error){this.db.exec('ROLLBACK');throw error}
  }
  exportar(autor:string):ExportacaoV2{
    if(!HEX.test(autor))throw new ErroAdmissao(400,'Autor inválido')
    const rows=this.db.prepare('SELECT envelope,objeto FROM elos WHERE autor=? ORDER BY indice').all(autor) as {envelope:string;objeto:string}[]
    const elos=rows.map(r=>{
      if(this.evidencias.ler(r.objeto).toString('utf8')!==r.envelope)throw new Error('Índice diverge do objeto assinado; reconstrução necessária')
      return JSON.parse(r.envelope) as EnvelopeV2
    })
    return{formato:'cosmos-export-v2',autor,elos}
  }
  async reconstruir(exportacao:ExportacaoV2):Promise<void>{
    if(exportacao.formato!=='cosmos-export-v2'||!Array.isArray(exportacao.elos)||exportacao.elos.length>10000)throw new ErroAdmissao(400,'Exportação inválida')
    for(const e of exportacao.elos){
      if(e.registro.autor!==exportacao.autor)throw new ErroAdmissao(400,'Autor da exportação divergente')
      await this.admitir(canonicalizarV2(e))
    }
  }
  close(){this.db.close()}
}
