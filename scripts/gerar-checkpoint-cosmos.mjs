import {readFile,writeFile} from 'node:fs/promises'
import {raizMerkle,provaInclusao,provaConsistencia} from '../src/v2/transparencia.ts'
const root=new URL('../',import.meta.url)
const pacote=JSON.parse(await readFile(new URL('src/dados/elos-assinados.json',root),'utf8'))
const folhas=pacote.cadeia.elos.map(e=>e.registroTexto)
const checkpoint={log:'cosmos-v1-502426c',tamanho:folhas.length,raiz:await raizMerkle(folhas)}
const inclusao=await Promise.all(folhas.map(async(_,i)=>({indice:i,prova:await provaInclusao(folhas,i)})))
const continuidade=await Promise.all(folhas.slice(0,-1).map(async(_,i)=>({anterior:{...checkpoint,tamanho:i+1,raiz:await raizMerkle(folhas.slice(0,i+1))},prova:await provaConsistencia(folhas,i+1)})))
const result={formato:'cosmos-checkpoint-v2',publicacao_independente:'pendente',checkpoint,resumo_final:pacote.resumo_final,pubkey:pacote.cadeia.chave,inclusao,continuidade}
await writeFile(new URL('public/cosmos-checkpoint-v1.json',root),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({checkpoint,publicacao_independente:'pendente'}))
