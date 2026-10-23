import { describe, expect, it } from 'vitest'
import { criarApiV2 } from '../src/v2/api-node'
import { LedgerV2 } from '../src/v2/ledger-node'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nacl from 'tweetnacl'
import { canonicalizarV2, FORMATO_V2 } from '../src/v2/canonico'
describe('API local v2 com limites e autenticação',()=>{
  it('admite pedido assinado, repete idempotentemente e recusa assinatura adulterada',async()=>{
    const ledger=new LedgerV2(join(mkdtempSync(join(tmpdir(),'cosmos-api-auth-')),'db.sqlite'))
    const api=criarApiV2(ledger)
    await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve))
    const url=`http://127.0.0.1:${(api.address() as {port:number}).port}/v2/elos`
    try{
      const p=nacl.sign.keyPair(),r={formato:FORMATO_V2,autor:Buffer.from(p.publicKey).toString('hex'),indice:0,anterior:'0'.repeat(64),pedido:'http-1',conteudo:{texto:'conteúdo'},evidencias:[]}
      const assinatura=Buffer.from(nacl.sign.detached(new TextEncoder().encode(FORMATO_V2+'\n'+canonicalizarV2(r)),p.secretKey)).toString('hex')
      const enviar=(signature:string)=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:canonicalizarV2({registro:r,assinatura:signature})})
      expect((await enviar(assinatura)).status).toBe(201)
      expect((await enviar(assinatura)).status).toBe(200)
      expect((await enviar('0'.repeat(128))).status).toBe(401)
    }finally{api.closeAllConnections();await new Promise<void>(resolve=>api.close(()=>resolve()));ledger.close()}
  })
  it('recusa assinatura ausente, tamanho excessivo e limita requisições',async()=>{
    const ledger=new LedgerV2(join(mkdtempSync(join(tmpdir(),'cosmos-api-')),'db.sqlite'))
    const api=criarApiV2(ledger,{maxRequests:3})
    await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve))
    const address=api.address() as {port:number},url=`http://127.0.0.1:${address.port}/v2/elos`
    try{
      expect((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(400)
      expect((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:' '.repeat(262145)})).status).toBe(413)
      expect((await fetch(url,{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status).toBe(415)
      expect((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(429)
    }finally{api.closeAllConnections();await new Promise<void>(resolve=>api.close(()=>resolve()));ledger.close()}
  })
})
