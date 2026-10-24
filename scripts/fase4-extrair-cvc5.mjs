// Remove somente o contêiner de apresentação do dump cvc5, sem alterar os passos.
// Não é parser/verificador Alethe. O checker real continua obrigatório.
export function extrairCorpoCvc5(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 7 || bytes.length > 1048576) throw new Error('dump-invalido')
  const crlf = bytes.subarray(0, 3).equals(Buffer.from('(\r\n'))
  const lf = bytes.subarray(0, 2).equals(Buffer.from('(\n'))
  const prefixo = crlf ? Buffer.from('(\r\n') : Buffer.from('(\n')
  const sufixo = crlf ? Buffer.from(')\r\n') : Buffer.from(')\n')
  if ((!crlf && !lf) || !bytes.subarray(bytes.length - sufixo.length).equals(sufixo)) throw new Error('involucro-cvc5-divergente')
  const corpo = Buffer.from(bytes.subarray(prefixo.length, bytes.length - sufixo.length))
  const fimLinha = crlf ? Buffer.from('\r\n') : Buffer.from('\n')
  if (!corpo.length || corpo[0] !== 40 || !corpo.subarray(corpo.length - fimLinha.length).equals(fimLinha)) throw new Error('corpo-ausente-ou-fechamento-fora-de-linha')
  return { corpo, prefixoHex: prefixo.toString('hex'), sufixoHex: sufixo.toString('hex') }
}
