export interface Checkpoint { log: string; tamanho: number; raiz: string }
const HEX = /^[0-9a-f]{64}$/
const bytes = (h: string) => { if (!HEX.test(h)) throw new Error('Hash Merkle inválido'); return Uint8Array.from(h.match(/../g)!, (x) => parseInt(x,16)) }
const sha = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(b)))].map(x=>x.toString(16).padStart(2,'0')).join('')
const leaf = (s: string) => sha(new Uint8Array([0,...new TextEncoder().encode(s)]))
const node = (a: string,b: string) => sha(new Uint8Array([1,...bytes(a),...bytes(b)]))
const split = (n: number) => { let k=1; while(k*2<n)k*=2; return k }
const size = (n: number) => Number.isSafeInteger(n) && n>=0

/** Árvore/provas de RFC 9162 2.1, domínios 0x00/0x01; não é servidor CT/TLS. */
export async function raizMerkle(folhas: readonly string[]): Promise<string> {
  if (!folhas.length) return sha(new Uint8Array())
  if (folhas.length===1) return leaf(folhas[0])
  const k=split(folhas.length)
  return node(await raizMerkle(folhas.slice(0,k)),await raizMerkle(folhas.slice(k)))
}
export async function provaInclusao(f: readonly string[], i: number): Promise<string[]> {
  if(!Number.isSafeInteger(i)||i<0||i>=f.length)throw new Error('Índice inválido')
  if(f.length===1)return []
  const k=split(f.length)
  return i<k ? [...await provaInclusao(f.slice(0,k),i),await raizMerkle(f.slice(k))]
    : [...await provaInclusao(f.slice(k),i-k),await raizMerkle(f.slice(0,k))]
}
export async function verificarInclusao(folha: string, i: number, n: number, prova: string[], raiz: string): Promise<boolean> {
  if(!size(n)||!size(i)||i>=n||!HEX.test(raiz)||prova.length>64)return false
  try {
    let pos=0
    const rec=async(index:number,count:number):Promise<string>=>{
      if(count===1)return leaf(folha)
      const k=split(count)
      const child=await rec(index<k?index:index-k,index<k?k:count-k)
      const sibling=prova[pos++]
      return index<k?node(child,sibling):node(sibling,child)
    }
    const got=await rec(i,n)
    return pos===prova.length&&got===raiz
  }catch{return false}
}
export async function provaConsistencia(f: readonly string[], m: number):Promise<string[]> {
  if(!size(m)||m>f.length)throw new Error('Prefixo inválido')
  if(m===0)return []
  const sub=async(a:readonly string[],count:number,complete:boolean):Promise<string[]>=>{
    if(count===a.length)return complete?[]:[await raizMerkle(a)]
    const k=split(a.length)
    return count<=k?[...await sub(a.slice(0,k),count,complete),await raizMerkle(a.slice(k))]
      :[...await sub(a.slice(k),count-k,false),await raizMerkle(a.slice(0,k))]
  }
  return sub(f,m,true)
}
export async function verificarConsistencia(m:number,n:number,old:string,next:string,proof:string[]):Promise<boolean>{
  if(!size(m)||!size(n)||m>n||!HEX.test(old)||!HEX.test(next)||proof.length>64)return false
  if(m===0){
    const empty=await raizMerkle([])
    return old===empty&&(n!==0||next===empty)&&proof.length===0
  }
  if(m===n)return old===next&&proof.length===0
  try{
    let fn=m-1,sn=n-1,pos=0
    while(fn%2===1){fn=Math.floor(fn/2);sn=Math.floor(sn/2)}
    let fr=fn===0?old:proof[pos++],sr=fr
    bytes(fr)
    for(;pos<proof.length;pos++){
      if(sn===0)return false
      const c=proof[pos];bytes(c)
      if(fn%2===1||fn===sn){
        fr=await node(c,fr);sr=await node(c,sr)
        while(fn!==0&&fn%2===0){fn=Math.floor(fn/2);sn=Math.floor(sn/2)}
      }else sr=await node(sr,c)
      fn=Math.floor(fn/2);sn=Math.floor(sn/2)
    }
    return sn===0&&fr===old&&sr===next
  }catch{return false}
}
export async function avaliarCheckpoint(ancora:Checkpoint,novo:Checkpoint,proof:string[]):Promise<'igual'|'extensao'|'rollback'|'bifurcada'|'continuidade_invalida'>{
  if(!ancora||!novo||ancora.log!==novo.log||!size(ancora.tamanho)||!size(novo.tamanho)||!HEX.test(ancora.raiz)||!HEX.test(novo.raiz))return 'continuidade_invalida'
  if(ancora.tamanho===0||novo.tamanho===0){
    const empty=await raizMerkle([])
    if((ancora.tamanho===0&&ancora.raiz!==empty)||(novo.tamanho===0&&novo.raiz!==empty))return 'continuidade_invalida'
  }
  if(novo.tamanho<ancora.tamanho)return 'rollback'
  if(novo.tamanho===ancora.tamanho)return novo.raiz===ancora.raiz?'igual':'bifurcada'
  return await verificarConsistencia(ancora.tamanho,novo.tamanho,ancora.raiz,novo.raiz,proof)?'extensao':'continuidade_invalida'
}
