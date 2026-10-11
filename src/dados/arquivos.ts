// Abrir arquivos compactados no próprio navegador: o TPTP entrega cada
// arquivo como .tgz (tar + gzip). Lê .gz/.tgz/.tar e devolve o texto dos
// arquivos de dentro; texto simples passa direto.

export interface ArquivoTexto {
  nome: string
  texto: string
}

/** Descompacta gzip (DecompressionStream existe em todos os navegadores atuais). */
async function gunzip(dados: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(fluxo).arrayBuffer())
}

const ehGzip = (d: Uint8Array) => d[0] === 0x1f && d[1] === 0x8b
const ehTar = (d: Uint8Array) => d.length > 262 && new TextDecoder().decode(d.subarray(257, 262)) === 'ustar'

/** Os arquivos de um .tar (formato ustar, com nomes longos do GNU). */
export function lerTar(d: Uint8Array): ArquivoTexto[] {
  const dec = new TextDecoder()
  const campo = (ini: number, tam: number) => dec.decode(d.subarray(ini, ini + tam)).replace(/\0.*$/s, '')
  const r: ArquivoTexto[] = []
  let nomeLongo: string | null = null
  for (let i = 0; i + 512 <= d.length; ) {
    if (d.subarray(i, i + 512).every((b) => b === 0)) break // fim do arquivo
    const tamanho = parseInt(campo(i + 124, 12).trim() || '0', 8)
    const tipo = String.fromCharCode(d[i + 156] || 48)
    const prefixo = campo(i + 345, 155)
    const nome = nomeLongo ?? (prefixo ? `${prefixo}/${campo(i, 100)}` : campo(i, 100))
    const conteudo = d.subarray(i + 512, i + 512 + tamanho)
    nomeLongo = null
    if (tipo === 'L') nomeLongo = dec.decode(conteudo).replace(/\0.*$/s, '')
    else if (tipo === '0' || tipo === '\0') r.push({ nome: nome.slice(nome.lastIndexOf('/') + 1), texto: dec.decode(conteudo) })
    i += 512 + Math.ceil(tamanho / 512) * 512
  }
  return r
}

/** O texto de um arquivo aberto pelo usuário (compactado ou não). */
export async function textosDoArquivo(arquivo: File): Promise<ArquivoTexto[]> {
  let d: Uint8Array<ArrayBuffer> = new Uint8Array(await arquivo.arrayBuffer())
  let nome = arquivo.name
  if (ehGzip(d)) {
    d = await gunzip(d)
    nome = nome.replace(/\.t?gz$/i, (m) => (m.toLowerCase() === '.tgz' ? '.tar' : ''))
  }
  if (ehTar(d)) return lerTar(d)
  return [{ nome, texto: new TextDecoder().decode(d) }]
}
