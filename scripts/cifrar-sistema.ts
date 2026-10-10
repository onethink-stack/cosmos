// Cifra um sistema pessoal com senha, para ir dentro do app sem ficar público.
//
// Uso:  npm run cifrar -- privado/principia.json
// Lê o sistema em texto claro (pasta privado/, que NÃO vai para o git), pede a
// senha duas vezes (sem mostrar na tela), grava src/dados/cifrado/<id>.json e
// confere decifrando de volta. Só o arquivo cifrado vai para o repositório.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { stdin, stdout } from 'node:process'
import { cifrar, decifrar } from '../src/dados/cripto.ts'

function perguntarSenha(rotulo: string): Promise<string> {
  return new Promise((ok) => {
    stdout.write(rotulo)
    let senha = ''
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const aoDigitar = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode?.(false)
          stdin.pause()
          stdin.off('data', aoDigitar)
          stdout.write('\n')
          ok(senha)
          return
        }
        if (c === '\u0003') process.exit(1) // Ctrl+C
        if (c === '\u007f' || c === '\b') {
          if (senha.length) {
            senha = senha.slice(0, -1)
            stdout.write('\b \b')
          }
          continue
        }
        senha += c
        stdout.write('•')
      }
    }
    stdin.on('data', aoDigitar)
  })
}

const arquivo = process.argv[2]
if (!arquivo) {
  console.error('Uso: npm run cifrar -- privado/<sistema>.json')
  process.exit(1)
}
const sistema = JSON.parse(readFileSync(arquivo, 'utf8'))
if (!sistema.id || !Array.isArray(sistema.notas)) {
  console.error('O arquivo precisa ter { id, nome, descricao, notas, dicionario }.')
  process.exit(1)
}
console.log(`Sistema "${sistema.nome}": ${sistema.notas.length} notas, ${sistema.dicionario?.length ?? 0} fichas.`)
console.log('Escolha uma senha forte (frase longa é melhor). Sem ela, o conteúdo não pode ser recuperado.')
const s1 = await perguntarSenha('Senha: ')
if (s1.length < 8) {
  console.error('Use pelo menos 8 caracteres.')
  process.exit(1)
}
const s2 = await perguntarSenha('Repita a senha: ')
if (s1 !== s2) {
  console.error('As senhas não conferem. Nada foi gravado.')
  process.exit(1)
}

const texto = JSON.stringify(sistema)
const c = await cifrar(texto, s1)
if ((await decifrar(c, s1)) !== texto) throw new Error('falha na conferência')
mkdirSync('src/dados/cifrado', { recursive: true })
const saida = `src/dados/cifrado/${sistema.id}.json`
writeFileSync(saida, JSON.stringify({ id: sistema.id, nome: sistema.nome, ...c }, null, 2) + '\n')
console.log(`✓ Cifrado e conferido: ${saida}`)
