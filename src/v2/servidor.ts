import { resolve } from 'node:path'
import { LedgerV2 } from './ledger-node'
import { criarApiV2 } from './api-node'
const ledger=new LedgerV2(resolve(process.env.COSMOS_V2_DADOS??'privado/v2','indice.sqlite'))
const port=Number(process.env.COSMOS_V2_PORT??4318)
if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Porta inválida')
const server=criarApiV2(ledger)
server.listen(port,'127.0.0.1',()=>console.log(`Cosmos v2 local: http://127.0.0.1:${port}`))
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>server.close(()=>{ledger.close();process.exit(0)}))
