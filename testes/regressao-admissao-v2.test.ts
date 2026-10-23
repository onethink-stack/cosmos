import { describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonicalizarV2, FORMATO_V2 } from '../src/v2/canonico'
import { LedgerV2 } from '../src/v2/ledger-node'
const hex=(b:Uint8Array)=>Buffer.from(b).toString('hex')
function registro(par:nacl.SignKeyPair,indice=0,anterior='0'.repeat(64),pedido='pedido-1',conteudo:unknown={texto:'teste'}){
  const r={formato:FORMATO_V2,autor:hex(par.publicKey),indice,anterior,pedido,conteudo,evidencias:[] as string[]}
  const assinatura=hex(nacl.sign.detached(new TextEncoder().encode(FORMATO_V2+'\n'+canonicalizarV2(r)),par.secretKey))
  return canonicalizarV2({registro:r,assinatura})
}
const make=()=>new LedgerV2(join(mkdtempSync(join(tmpdir(),'cosmos-v2-')),'indice.sqlite'))
describe('admissão multiusuário v2',()=>{
  it('não arquiva objetos de bifurcações recusadas',async()=>{
    const l=make(),p=nacl.sign.keyPair()
    try{
      await l.admitir(registro(p))
      const antes=readdirSync(l.evidencias.replicas[0])
      await expect(l.admitir(registro(p,0,'0'.repeat(64),'fork'))).rejects.toMatchObject({codigo:409})
      expect(readdirSync(l.evidencias.replicas[0])).toEqual(antes)
    }finally{l.close()}
  })
  it('autentica por assinatura, é idempotente e exporta elos assinados',async()=>{
    const l=make(),p=nacl.sign.keyPair(),text=registro(p)
    try{
      expect((await l.admitir(text)).duplicado).toBe(false)
      expect((await l.admitir(text)).duplicado).toBe(true)
      expect(l.exportar(hex(p.publicKey)).elos).toHaveLength(1)
      const bad=JSON.parse(text);bad.registro.conteudo={texto:'adulterado'}
      await expect(l.admitir(canonicalizarV2(bad))).rejects.toMatchObject({codigo:401})
    }finally{l.close()}
  })
  it('recusa fork, lacuna e reutilização conflitante da idempotência',async()=>{
    const l=make(),p=nacl.sign.keyPair()
    try{
      const first=await l.admitir(registro(p))
      await expect(l.admitir(registro(p,0,'0'.repeat(64),'outro'))).rejects.toMatchObject({codigo:409})
      await expect(l.admitir(registro(p,1,first.hash,'pedido-1'))).rejects.toMatchObject({codigo:409})
      await expect(l.admitir(registro(p,2,first.hash,'pedido-3'))).rejects.toMatchObject({codigo:409})
      expect((await l.admitir(registro(p,1,first.hash,'pedido-2'))).duplicado).toBe(false)
    }finally{l.close()}
  })
  it('duas conexões ao mesmo índice aceitam somente uma versão do índice 0',async()=>{
    const file=join(mkdtempSync(join(tmpdir(),'cosmos-conc-')),'db.sqlite'),a=new LedgerV2(file),b=new LedgerV2(file),p=nacl.sign.keyPair()
    try{
      const results=await Promise.allSettled([a.admitir(registro(p)),b.admitir(registro(p,0,'0'.repeat(64),'outro'))])
      expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
      expect(a.exportar(hex(p.publicKey)).elos).toHaveLength(1)
    }finally{a.close();b.close()}
  })
  it('reconstrói índice somente após conferir novamente todas as assinaturas',async()=>{
    const a=make(),b=make(),p=nacl.sign.keyPair()
    try{
      const head=await a.admitir(registro(p));await a.admitir(registro(p,1,head.hash,'pedido-2'))
      await b.reconstruir(a.exportar(hex(p.publicKey)))
      expect(b.exportar(hex(p.publicKey))).toEqual(a.exportar(hex(p.publicKey)))
    }finally{a.close();b.close()}
  })
  it('limita tamanho/profundidade e recusa registro não canônico',async()=>{
    const l=make()
    try{
      await expect(l.admitir('['.repeat(10000))).rejects.toThrow(/profundidade/)
      await expect(l.admitir(' '.repeat(262145))).rejects.toThrow(/tamanho/)
      await expect(l.admitir('{ }')).rejects.toThrow()
    }finally{l.close()}
  })
  it('replica evidência endereçada por hash e detecta corrupção',()=>{
    const l=make(),data=Buffer.from('evidência verificável')
    try{
      const hash=l.evidencias.gravar(data)
      expect(l.evidencias.ler(hash)).toEqual(data)
      writeFileSync(join(l.evidencias.replicas[0],hash),Buffer.from('adulterado'))
      expect(l.evidencias.ler(hash)).toEqual(data)
      writeFileSync(join(l.evidencias.replicas[1],hash),Buffer.from('adulterado'))
      expect(()=>l.evidencias.ler(hash)).toThrow()
      expect(readFileSync(join(l.evidencias.replicas[0],hash)).toString()).toBe('adulterado')
    }finally{l.close()}
  })
})
