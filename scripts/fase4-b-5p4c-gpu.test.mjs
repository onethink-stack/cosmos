import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { conferirPacote5p4c } from './fase4-b-5p4c-pacote.mjs'
import { sha256 } from '../FASE4_B_5P4C_TRADUTOR.ts'
const nomes = ['pacote.json','entrada.bin','kernel.wgsl','testemunhos.bin','testemunhos-repeticao.bin','host-metadata.json','host-build.json','host-build-pin.json']
const original = new Map(nomes.map(n => [n, readFileSync(new URL('../evidencias/fase4-b-5p4c-gpu-pacote/' + n, import.meta.url))]))
const fonte = n => readFileSync(new URL('../' + n, import.meta.url))
const conferir = m => conferirPacote5p4c(n => { const b=m.get(n); if(!b) throw Error('arquivo-ausente');return b }, fonte)
const alterarJson = (m,n,f) => { const j=JSON.parse(m.get(n));f(j);m.set(n,Buffer.from(JSON.stringify(j))) }
const rehash = m => alterarJson(m,'pacote.json',p=>{
  for(const n of Object.keys(p.arquivos))p.arquivos[n]=sha256(m.get(n))
  p.saidaSha256=sha256(m.get('testemunhos.bin'))
})
test('pacote GPU real reconstitui entrada e prova dos 1M testemunhos',()=>{
  const r=conferir(original);assert.equal(r.ponte.prova.length,29073);assert.equal(r.host.backend,'Vulkan')
})
test('adulteracao com hash antigo recusada',()=>{
  const m=new Map(original),b=Buffer.from(m.get('testemunhos.bin'));b[0]^=1;m.set('testemunhos.bin',b)
  assert.throws(()=>conferir(m),/divergente/)
})
for(const [n,v,e] of [['slot',0xfffffffe,'slot-nao-escrito'],['SAT',0xffffffff,'sentinela-sat'],['indice',75,'indice-fora-do-dominio'],['verdadeira',0,'testemunho-nao-falsifica-clausula']])test(`testemunho ${n} recusado com hashes recalculados`,()=>{
  const m=new Map(original),b=Buffer.from(m.get('testemunhos.bin'));b.writeUInt32LE(v,b.length-4)
  m.set('testemunhos.bin',b);m.set('testemunhos-repeticao.bin',Buffer.from(b));rehash(m)
  assert.throws(()=>conferir(m),new RegExp(e))
})
test('fallback/software recusado com hashes recalculados',()=>{
  const m=new Map(original);alterarJson(m,'host-metadata.json',h=>{h.deviceType='Cpu';h.fallbackCpu=true});rehash(m)
  assert.throws(()=>conferir(m),/dispositivo-nao-conferido/)
})
test('chave de arquivo adicional nao e lida',()=>{
  const m=new Map(original);alterarJson(m,'pacote.json',p=>{p.arquivos['../privado']= '0'.repeat(64)})
  assert.throws(()=>conferir(m),/pacote-invalido/)
})
test('reapresentacao do host 4p3c recusada mesmo com hashes recalculados',()=>{
  const m=new Map(original);alterarJson(m,'host-build-pin.json',p=>{p.exeSha256='cab9b944d89f94d1adb6d37a0c3c219ac4b173c7adf81d5565c6e3792a7eb3bf'});rehash(m)
  assert.throws(()=>conferir(m),/pin-host-divergente/)
})
