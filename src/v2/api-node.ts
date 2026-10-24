import { createServer } from 'node:http'
import type { LedgerV2 } from './ledger-node'
import { ErroAdmissao } from './ledger-node'
import { MAX_BYTES_V2 } from './canonico'

/** Loopback por padrão no entrypoint; auth é Ed25519 sobre o pedido canônico inteiro.
 * Proxy/rede pública, TLS e autorização de publicação exigem configuração separada.
 */
export function criarApiV2(ledger:LedgerV2,opcoes:{maxRequests?:number}={}){
  const limites=new Map<string,{inicio:number;n:number}>()
  const server=createServer(async(req,res)=>{
    const reply=(status:number,body:unknown)=>{
      if(!res.headersSent){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body))}
    }
    const ip=req.socket.remoteAddress??'desconhecido',agora=Date.now()
    for(const [k,v]of limites)if(agora-v.inicio>=60000)limites.delete(k)
    if(!limites.has(ip)&&limites.size>=2000){req.resume();reply(429,{erro:'Limite de clientes'});return}
    const limite=limites.get(ip)??{inicio:agora,n:0};limite.n++;limites.set(ip,limite)
    if(limite.n>(opcoes.maxRequests??60)||limites.size>2000){req.resume();reply(429,{erro:'Limite de requisições'});return}
    try{
      if(req.method==='GET'&&/^\/v2\/cadeias\/[a-f0-9]{64}$/.test(req.url??'')){
        reply(200,ledger.exportar(req.url!.split('/').at(-1)!));return
      }
      if(req.method!=='POST'||req.url!=='/v2/elos'){req.resume();reply(404,{erro:'Rota inexistente'});return}
      if(req.headers['content-type']?.split(';')[0]!=='application/json'){req.resume();reply(415,{erro:'Use application/json'});return}
      const declared=req.headers['content-length']
      if(declared&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BYTES_V2)){req.resume();reply(413,{erro:'Limite de tamanho'});return}
      const chunks:Buffer[]=[];let total=0
      for await(const chunk of req){
        total+=chunk.length
        if(total>MAX_BYTES_V2){reply(413,{erro:'Limite de tamanho'});return}
        chunks.push(Buffer.from(chunk))
      }
      const texto=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))
      const resultado=await ledger.admitir(texto)
      reply(resultado.duplicado?200:201,resultado)
    }catch(error){
      const e=error as Error
      const code=error instanceof ErroAdmissao?error.codigo:/Limite/.test(e.message)?413:400
      reply(code,{erro:code>=500?'Falha interna':e.message})
    }
  })
  server.requestTimeout=10000;server.headersTimeout=5000;server.maxConnections=64
  return server
}
