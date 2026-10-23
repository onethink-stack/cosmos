import { useEffect, useState } from 'preact/hooks'
import { PACOTE_COSMOS } from '../dados/pacoteCosmos'
import { conferirElosCosmos } from '../motor/elosCosmos'
import { raizMerkle, avaliarCheckpoint, provaConsistencia, type Checkpoint } from '../v2/transparencia'

export function CheckpointCosmos() {
  const [estado,setEstado]=useState('conferindo memória local')
  useEffect(()=>{
    let ativo=true
    void (async()=>{
      const conferencia=await conferirElosCosmos(PACOTE_COSMOS,PACOTE_COSMOS.fases)
      if(!conferencia.verificado)throw new Error('Cadeia não verificada; checkpoint não armazenado')
      const folhas=PACOTE_COSMOS.cadeia.elos.map(e=>e.registroTexto)
      const atual:Checkpoint={log:'cosmos-v1-502426c',tamanho:folhas.length,raiz:await raizMerkle(folhas)}
      let mensagem='primeiro contato local'
      try{
        const texto=localStorage.getItem('cosmos-checkpoint-v1')
        if(texto){
          const antes=JSON.parse(texto) as Checkpoint
          const prova=Number.isSafeInteger(antes.tamanho)&&antes.tamanho>=0&&antes.tamanho<=folhas.length?await provaConsistencia(folhas,antes.tamanho):[]
          mensagem=await avaliarCheckpoint(antes,atual,prova)
        }
        if(['primeiro contato local','igual','extensao'].includes(mensagem))localStorage.setItem('cosmos-checkpoint-v1',JSON.stringify(atual))
      }catch{mensagem='memória local indisponível ou checkpoint inválido'}
      if(ativo)setEstado(mensagem)
    })().catch(()=>{if(ativo)setEstado('checkpoint não verificado')})
    return()=>{ativo=false}
  },[])
  return <p class="cosmos-escopos" role={['rollback','bifurcada','continuidade_invalida'].includes(estado)?'alert':'status'}>
    Checkpoint: {estado} · âncora externa não configurada · <a href="./cosmos-checkpoint-v1.json" download>arquivo para publicação independente</a>
  </p>
}
