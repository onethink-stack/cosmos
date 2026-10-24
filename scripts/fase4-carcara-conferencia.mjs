// Conferência CPU real em runner Linux. Sem instalação, rede, dotenv ou segredo.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync, realpathSync } from 'node:fs'
import { resolve, join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { platform, arch, release } from 'node:os'
import { extrairCorpoCvc5 } from './fase4-extrair-cvc5.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const dir = join(root, 'evidencias/fase4-run')
const sha = b => createHash('sha256').update(b).digest('hex')
const json = p => JSON.parse(readFileSync(join(root, p), 'utf8').replace(/^\uFEFF/, ''))
const cvcPin = '868a0d7a5e3acba7d7e71b95c7a7f89fdc7b82d1ab8d2ea4a84ff067274bdf5a'
const checkerPin = 'fcd06852931d36b13e6d3f7965c81a068f5cfe2f3c5e7da2d91af500f8f1bfda'
const pacote = join(root, 'evidencias/fase4-cpu-referencia')
const inicio = performance.now()
mkdirSync(dir) // Nunca sobrescrever evidências anteriores.
mkdirSync(join(root, 'tmp'), { recursive: true })
const recibo = json('evidencias/fase4-carcara-recibo.template.json')
recibo.tipo = 'execucao-real'; recibo.estado = 'iniciada'
recibo.execucao = { ...recibo.execucao, autorizacaoOperadorReferencia: 'FASE4_PUBLICACAO_AUTORIZADA.md',
  inventarioFontesReferencia: 'FASE4_CARCARA_PUBLICACAO.json',
  inventarioFontesSha256: sha(readFileSync(join(root, 'FASE4_CARCARA_PUBLICACAO.json'))),
  commitExecutadoSeAplicavel: process.env.GITHUB_SHA ?? null,
  ciRunIdSeAplicavel: process.env.GITHUB_RUN_ID ?? null,
  ciRunUrlSeAplicavel: process.env.GITHUB_RUN_ID ? `https://github.com/onethink-stack/cosmos/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  sistema: `${platform()} ${release()}`, arquitetura: arch(), nodeVersao: process.versions.node,
  inicioDeclaradoUtc: new Date().toISOString(), observacao: 'Somente metadados públicos selecionados do runner; data não autenticada.' }
recibo.conclusao.limites = [
  'Execução CPU; não certifica Windows nem GPU.', 'Recibo não é assinatura ou OTS.',
  'Indisponibilidade/timeout não contam como rejeição semântica.',
  'Diagnósticos e mutações exatas são preservados para revisão.' ]
let binario
const limpar = b => String(b ?? '').replaceAll(root, '<workspace>').replaceAll(binario ?? '<nao-definido>', '<carcara>')
function gravar(nome, dado) {
  const bytes = Buffer.from(JSON.stringify(dado, null, 2) + '\n')
  writeFileSync(join(dir, nome), bytes, { flag: 'wx' })
  return { referencia: `evidencias/fase4-run/${nome}`, sha256: sha(bytes) }
}
function rodar(comando, args, cwd, env = {}) {
  const t = performance.now()
  const r = spawnSync(comando, args, { cwd, env, shell: false, timeout: 20000, killSignal: 'SIGKILL',
    maxBuffer: 1048576, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  return { exitCode: r.status, signal: r.signal, erro: r.error ? r.error.code ?? 'erro-execucao' : null,
    duracaoMs: Math.trunc(performance.now() - t), stdout: limpar(r.stdout), stderr: limpar(r.stderr) }
}
function cli(p, trabalho) {
  const args = ['--experimental-strip-types', 'scripts/fase4-referencia-cpu.mjs', 'verificar', '--pacote', p,
    '--trabalho', trabalho, '--cvc5-sha256', cvcPin, '--carcara', binario, '--carcara-sha256', checkerPin]
  const r = rodar(process.execPath, args, root)
  let resultado = null
  try { resultado = JSON.parse(r.stdout) } catch { /* Sem JSON não há aprovação. */ }
  return { ...r, resultado, comando: ['node', ...args.map(limpar)] }
}
function direto(prova, problema) {
  if (sha(readFileSync(binario)) !== checkerPin) throw new Error('pin-checker-divergente')
  return rodar(binario, ['--no-color', 'check', prova, problema], root)
}
function preservacao() {
  return Object.entries(json('evidencias/p1-groq-sha256-esperados.json')).map(([arquivo, esperado]) => {
    if (!existsSync(join(root, arquivo))) return { arquivo, esperado, estado: 'ausente-nao-aferido' }
    const atual = sha(readFileSync(join(root, arquivo)))
    if (atual !== esperado) throw new Error('preservacao-divergente')
    return { arquivo, esperado, atual, estado: 'identico' }
  })
}
try {
  if (platform() !== 'linux' || arch() !== 'x64' || process.versions.node !== '22.14.0') throw new Error('ambiente-divergente')
  const inventario = json('FASE4_CARCARA_PUBLICACAO.json')
  for (const f of inventario.arquivos) {
    if (!/^(?:src\/fase4\/|scripts\/fase4-|evidencias\/fase4-|\.github\/workflows\/fase4-|FASE4_|\.gitattributes$)/.test(f.arquivo)
      || f.arquivo.includes('..') || sha(readFileSync(join(root, f.arquivo))) !== f.sha256) throw new Error('inventario-divergente')
  }
  recibo.preservacao.runnerSelecaoPublica = { estado: 'inventario-conferido', inventarioConferidoReferenciaPublica: 'FASE4_CARCARA_PUBLICACAO.json',
    pinsP1Antes: preservacao(), observacao: 'Arquivos ausentes não são classificados como preservados; não há build nesta conferência.' }
  const pin = json('evidencias/fase4-carcara-pin-aprovado.json')
  if (pin.sha256EsperadoAprovado !== checkerPin) throw new Error('aprovacao-pin-divergente')
  const caminho = process.argv[2]
  if (process.argv.length !== 3 || !caminho || !isAbsolute(caminho) || !lstatSync(caminho).isFile() || lstatSync(caminho).isSymbolicLink()) throw new Error('checker-invalido')
  binario = realpathSync(caminho)
  if (readFileSync(binario).length !== 5402048 || sha(readFileSync(binario)) !== checkerPin) throw new Error('pin-checker-divergente')
  Object.assign(recibo.checker, { sha256EsperadoAprovado: checkerPin, sha256Observado: checkerPin,
    origemPinReferenciaPublica: pin.origemPinReferenciaPublica, hipoteseConfiancaAprovada: pin.hipoteseConfiancaAprovada,
    pinConferidoAntesDeExecutar: true, estado: 'binario-conferido', observacao: 'Confiança inicial HTTPS aprovada pelo operador; não é assinatura do fabricante.' })
  const versao = rodar(binario, ['--version'], root)
  gravar('checker-versao.json', versao)
  recibo.checker.versaoObservada = versao.stdout.trim() || null
  const entrada = readFileSync(join(pacote, 'entrada.smt2')), prova = readFileSync(join(pacote, 'proof.alethe'))
  const certBytes = readFileSync(join(pacote, 'cert.json')), cert = JSON.parse(certBytes)
  recibo.artefatos.entrada.sha256ObservadoNoRunner = sha(entrada)
  recibo.artefatos.prova.sha256ObservadoNoRunner = sha(prova)
  recibo.artefatos.prova.bytesObservadosNoRunner = prova.length
  recibo.artefatos.certificado.sha256EsperadoNoInventarioConfiavel = inventario.arquivos.find(f => f.arquivo === 'evidencias/fase4-cpu-referencia/cert.json').sha256
  recibo.artefatos.certificado.sha256ObservadoNoRunner = sha(certBytes)
  // A referência original permanece intacta. O dump cvc5 contém um contêiner
  // externo que o checker não considera um comando Alethe. Extrair em cópia.
  const extraida = extrairCorpoCvc5(prova)
  const pacoteConferencia = join(dir, 'derivacao-cvc5')
  mkdirSync(pacoteConferencia)
  writeFileSync(join(pacoteConferencia, 'entrada.smt2'), entrada, { flag: 'wx' })
  writeFileSync(join(pacoteConferencia, 'proof.alethe'), extraida.corpo, { flag: 'wx' })
  const certExtraido = { ...cert, provaSha256: sha(extraida.corpo) }
  writeFileSync(join(pacoteConferencia, 'cert.json'), JSON.stringify(certExtraido, null, 2) + '\n', { flag: 'wx' })
  const derivacao = gravar('derivacao-cvc5.json', {
    regra: 'remover-somente-container-externo-dump-cvc5-v1', origemSha256: sha(prova), destinoSha256: sha(extraida.corpo),
    bytesOrigem: prova.length, bytesDestino: extraida.corpo.length,
    prefixoRemovidoHex: extraida.prefixoHex, sufixoRemovidoHex: extraida.sufixoHex,
    fonte: 'https://github.com/cvc5/cvc5/blob/cvc5-1.4.2/contrib/get-carcara-checker',
    observacao: 'Apenas extração reversível de contêiner; passos internos e CRLF preservados. Certificado derivado não é nova assinatura.' })
  recibo.artefatos.provaConferida = { arquivoPublico: 'evidencias/fase4-run/derivacao-cvc5/proof.alethe',
    sha256: sha(extraida.corpo), bytes: extraida.corpo.length, derivacaoReferencia: derivacao.referencia, derivacaoSha256: derivacao.sha256 }
  const positivo = cli(pacoteConferencia, 'tmp/fase4-conferencia-carcara-1')
  const p = gravar('positivo-cli.json', positivo)
  const diagPositivo = direto(join(pacoteConferencia, 'proof.alethe'), join(pacoteConferencia, 'entrada.smt2'))
  const d = gravar('positivo-checker-direto.json', diagPositivo)
  Object.assign(recibo.positivo, { estado: positivo.resultado?.estado === 'verificado-cpu' ? 'aprovado' : 'nao-aprovado',
    comandoEfetivoSemSegredos: positivo.comando, duracaoMs: positivo.duracaoMs, exitCodeCli: positivo.exitCode,
    resultadoCliArquivoPublico: p.referencia, resultadoCliSha256: p.sha256, estadoCliObservado: positivo.resultado?.estado ?? null,
    exitCodeCarcaraObservado: diagPositivo.exitCode, stdoutCarcaraObservado: diagPositivo.stdout,
    diagnosticoDiretoArquivoPublico: d.referencia, diagnosticoDiretoSha256: d.sha256,
    observacao: 'Saídas reais do CLI e do checker direto preservadas, sem aprovação alternativa.' })
  if (positivo.exitCode !== 0 || positivo.resultado?.estado !== 'verificado-cpu' || diagPositivo.exitCode !== 0
    || diagPositivo.erro || diagPositivo.signal || diagPositivo.stdout.trim() !== 'valid') throw new Error('positivo-nao-aprovado')
  const provaConferida = extraida.corpo
  const texto = provaConferida.toString('utf8')
  const originalPasso = '(step t0 (cl @p_4 @p_8) :rule or :premises (a28))'
  const originalPremissa = '(assume a0 (! (or p0h0 p0h1 p0h2) :named @p_1))'
  if (texto.split(originalPasso).length !== 2 || texto.split(originalPremissa).length !== 2) throw new Error('mutacao-inaplicavel')
  const alteradoByte = Buffer.from(provaConferida); alteradoByte[0] ^= 1
  const casos = [
    { bytes: alteradoByte, recalcular: false, mudanca: 'XOR 1 no primeiro byte; certificado original.', classe: 'integridade' },
    { bytes: provaConferida.subarray(0, Math.floor(provaConferida.length / 2)), recalcular: true, mudanca: 'Truncar corpo extraído para metade dos bytes.', classe: 'estrutura' },
    { bytes: Buffer.from(texto.replace(originalPasso, '(step t0 (cl @p_4) :rule or :premises (a28))')), recalcular: true,
      mudanca: 'Em t0, remover literal @p_8 da conclusão de or, preservando regra e premissa a28.', classe: 'semantica' },
    { bytes: Buffer.from(texto.replace(originalPremissa, '(assume a0 (! false :named @p_1))')), recalcular: true,
      mudanca: 'Trocar somente a fórmula de assume a0 por false; preservar alias @p_1 e problema original.', classe: 'premissa' },
  ]
  for (const [i, caso] of casos.entries()) {
    const n = recibo.negativos[i]
    const rel = `evidencias/fase4-run/caso-${i + 1}`
    const destino = join(root, rel)
    mkdirSync(destino)
    writeFileSync(join(destino, 'entrada.smt2'), entrada, { flag: 'wx' })
    writeFileSync(join(destino, 'proof.alethe'), caso.bytes, { flag: 'wx' })
    const c = { ...certExtraido, ...(caso.recalcular ? { provaSha256: sha(caso.bytes) } : {}) }
    const cbytes = Buffer.from(JSON.stringify(c, null, 2) + '\n')
    writeFileSync(join(destino, 'cert.json'), cbytes, { flag: 'wx' })
    const trabalho = `tmp/fase4-negativo-${i + 1}`
    const r = cli(destino, trabalho)
    const diag = caso.recalcular ? direto(join(destino, 'proof.alethe'), join(destino, 'entrada.smt2')) : null
    const evidencia = gravar(`negativo-${i + 1}.json`, { mutacao: caso.mudanca, cli: r, checkerDireto: diag })
    Object.assign(n, { estado: 'executado', mutacaoExataReferenciaPublica: evidencia.referencia,
      provaMutanteSha256: sha(caso.bytes), certificadoMutanteSha256: sha(cbytes), hashProvaRecalculadoNoCertificado: caso.recalcular,
      trabalhoRelativoNovo: trabalho, exitCodeCli: r.exitCode, estadoCliObservado: r.resultado?.estado ?? null,
      checkerExecutado: caso.recalcular && existsSync(join(root, trabalho, 'proof.alethe')),
      exitCodeCarcara: diag?.exitCode ?? null, duracaoMs: r.duracaoMs,
      evidenciaReferenciaPublica: evidencia.referencia, evidenciaSha256: evidencia.sha256, classificacaoObservada: null })
    if (r.erro || r.signal || r.exitCode !== 2 || !r.resultado || r.resultado.estado === 'verificado-cpu') throw new Error('negativo-nao-recusado')
    if (!caso.recalcular) {
      if (r.resultado.estado !== 'invalido' || existsSync(join(root, trabalho))) throw new Error('fronteira-integridade-divergente')
      n.estado = 'rejeitado'; n.classificacaoObservada = 'integridade-antes-do-checker'
      continue
    }
    if (!n.checkerExecutado || diag.erro || diag.signal || !Number.isInteger(diag.exitCode) || diag.exitCode === 0
      || diag.exitCode >= 128 || diag.stdout.trim() === 'valid') throw new Error('negativo-checker-inconclusivo')
    const diagnostico = diag.stdout + '\n' + diag.stderr
    const sintaxe = /pars(?:e|ing|er)|unexpected|unclosed|end.of.(?:file|input)|eof|syntax/i.test(diagnostico)
    if (caso.classe === 'estrutura' && !sintaxe) throw new Error('diagnostico-estrutural-nao-demonstrado')
    if (caso.classe !== 'estrutura' && sintaxe) throw new Error('negativo-semantico-com-erro-sintatico')
    // A revisão do diagnóstico textual continua explícita no recibo, não é presumida por exit code.
    n.estado = 'rejeitado'; n.classificacaoObservada = caso.classe === 'estrutura' ? 'erro-estrutural-checker-real' : 'recusa-checker-real-mutacao-semantica-diagnostico-para-revisao'
  }
  recibo.conclusao.referenciaCpuFormal = 'positivo-conferido-negativos-recusados-diagnosticos-para-revisao'
  recibo.conclusao.homologacaoLinux = 'execucao-concluida-revisao-diagnosticos-pendente'
  recibo.estado = 'execucao-concluida'
  console.log('CPU: positivo verificado; quatro negativos recusados. Revisar diagnósticos semânticos. B GPU pendente.')
} catch (e) {
  recibo.estado = 'nao-aprovado'
  recibo.motivoFinal = e instanceof Error && /^[a-z-]+$/.test(e.message) ? e.message : 'falha-interna-nao-aprovada'
  process.exitCode = 1
  console.error(`Conferência CPU não aprovada: ${recibo.motivoFinal}. B GPU pendente.`)
} finally {
  recibo.execucao.duracaoMs = Math.trunc(performance.now() - inicio)
  try { recibo.preservacao.runnerSelecaoPublica.pinsP1Depois = preservacao() } catch { recibo.estado = 'nao-aprovado'; process.exitCode = 1 }
  gravar('recibo.json', recibo)
}
