import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync, openSync, closeSync, fsyncSync, linkSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
export const sha256Bytes=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex')
const HEX=/^[a-f0-9]{64}$/
/** Réplicas locais configuráveis; não promete independência física entre diretórios. */
export class ObjetosReplicados {
  constructor(readonly replicas: string[]){
    if(replicas.length<2||new Set(replicas.map(p=>resolve(p))).size!==replicas.length)throw new Error('Exige duas réplicas distintas')
    for(const dir of replicas)mkdirSync(dir,{recursive:true})
  }
  gravar(b:Uint8Array):string{
    if(b.length>1048576)throw new Error('Objeto excede 1 MiB')
    const hash=sha256Bytes(b)
    for(const dir of this.replicas){
      const path=join(dir,hash)
      if(existsSync(path)){if(sha256Bytes(readFileSync(path))!==hash)throw new Error('Réplica existente corrompida')}
      else {
        const temp=join(dir,`.cosmos-${randomUUID()}.tmp`)
        try {
          const fd=openSync(temp,'wx')
          try { writeFileSync(fd,b);fsyncSync(fd) } finally { closeSync(fd) }
          try { linkSync(temp,path) } catch(error) {
            if((error as NodeJS.ErrnoException).code!=='EEXIST'||sha256Bytes(readFileSync(path))!==hash)throw error
          }
        } finally { if(existsSync(temp))unlinkSync(temp) }
      }
    }
    return hash
  }
  ler(hash:string):Buffer{
    if(!HEX.test(hash))throw new Error('Endereço de objeto inválido')
    for(const dir of this.replicas){
      try{const b=readFileSync(join(dir,hash));if(sha256Bytes(b)===hash)return b}catch{/* tenta outra réplica */}
    }
    throw new Error('Objeto ausente ou todas as réplicas corrompidas')
  }
}
