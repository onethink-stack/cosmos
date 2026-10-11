// Constantes físicas fundamentais (CODATA 2018, recomendadas pelo NIST),
// embutidas no app (funciona sem internet). As exatas são as que definem o
// SI desde 2019. Entram como fatos (grau F, com fonte), com uma constante
// numérica cada: o Z3 as usa nas contas.

import { numeroTexto } from '../motor/dados'
import { notaVazia } from './estado'
import type { EntradaDicionario, Nota } from './tipos'

export interface ConstanteFisica {
  simbolo: string
  nome: string
  valor: number
  unidade: string
  /** incerteza padrão (0 = exata) */
  incerteza: number
}

export const CODATA: ConstanteFisica[] = [
  { simbolo: 'cLuz', nome: 'velocidade da luz no vácuo', valor: 299792458, unidade: 'm/s', incerteza: 0 },
  { simbolo: 'hPlanck', nome: 'constante de Planck', valor: 6.62607015e-34, unidade: 'J·s', incerteza: 0 },
  { simbolo: 'hBarra', nome: 'constante de Planck reduzida (ħ)', valor: 1.054571817e-34, unidade: 'J·s', incerteza: 0 },
  { simbolo: 'eCarga', nome: 'carga elementar', valor: 1.602176634e-19, unidade: 'C', incerteza: 0 },
  { simbolo: 'kBoltzmann', nome: 'constante de Boltzmann', valor: 1.380649e-23, unidade: 'J/K', incerteza: 0 },
  { simbolo: 'nAvogadro', nome: 'constante de Avogadro', valor: 6.02214076e23, unidade: '1/mol', incerteza: 0 },
  { simbolo: 'gNewton', nome: 'constante gravitacional', valor: 6.6743e-11, unidade: 'm³/(kg·s²)', incerteza: 1.5e-15 },
  { simbolo: 'gPadrao', nome: 'aceleração padrão da gravidade', valor: 9.80665, unidade: 'm/s²', incerteza: 0 },
  { simbolo: 'mEletron', nome: 'massa do elétron', valor: 9.1093837015e-31, unidade: 'kg', incerteza: 2.8e-40 },
  { simbolo: 'mProton', nome: 'massa do próton', valor: 1.67262192369e-27, unidade: 'kg', incerteza: 5.1e-37 },
  { simbolo: 'mNeutron', nome: 'massa do nêutron', valor: 1.67492749804e-27, unidade: 'kg', incerteza: 9.5e-37 },
  { simbolo: 'uMassa', nome: 'unidade de massa atômica', valor: 1.6605390666e-27, unidade: 'kg', incerteza: 5e-37 },
  { simbolo: 'epsilon0', nome: 'permissividade elétrica do vácuo', valor: 8.8541878128e-12, unidade: 'F/m', incerteza: 1.3e-21 },
  { simbolo: 'mu0', nome: 'permeabilidade magnética do vácuo', valor: 1.25663706212e-6, unidade: 'N/A²', incerteza: 1.9e-16 },
  { simbolo: 'alfaEstrutura', nome: 'constante de estrutura fina', valor: 7.2973525693e-3, unidade: '', incerteza: 1.1e-12 },
  { simbolo: 'rGases', nome: 'constante dos gases', valor: 8.314462618, unidade: 'J/(mol·K)', incerteza: 0 },
  { simbolo: 'fFaraday', nome: 'constante de Faraday', valor: 96485.33212, unidade: 'C/mol', incerteza: 0 },
  { simbolo: 'sigmaStefan', nome: 'constante de Stefan–Boltzmann', valor: 5.670374419e-8, unidade: 'W/(m²·K⁴)', incerteza: 0 },
  { simbolo: 'rRydberg', nome: 'constante de Rydberg', valor: 10973731.56816, unidade: '1/m', incerteza: 2.1e-5 },
  { simbolo: 'a0Bohr', nome: 'raio de Bohr', valor: 5.29177210903e-11, unidade: 'm', incerteza: 8e-21 },
  { simbolo: 'atmPadrao', nome: 'atmosfera padrão', valor: 101325, unidade: 'Pa', incerteza: 0 },
]

/**
 * Fichas e fatos das constantes escolhidas. Um símbolo que já existe no
 * dicionário com outro sentido ganha um número no fim.
 */
export function constantesComoFatos(escolhidas: ConstanteFisica[], dicionario: EntradaDicionario[]): { fichas: EntradaDicionario[]; fatos: Nota[] } {
  const usados = new Map(dicionario.map((e) => [e.simbolo, e]))
  const fichas: EntradaDicionario[] = []
  const fatos: Nota[] = []
  for (const k of escolhidas) {
    let s = k.simbolo
    const existente = usados.get(s)
    if (existente && !(existente.tipo === 'constante' && existente.numerico)) {
      let i = 2
      while (usados.has(`${k.simbolo}${i}`)) i++
      s = `${k.simbolo}${i}`
    }
    if (!usados.has(s)) {
      const f: EntradaDicionario = { id: '', simbolo: s, termo: k.nome, tipo: 'constante', aridade: 0, numerico: true, definicao: `${k.nome} (CODATA 2018), em ${k.unidade || 'unidade adimensional'}.` }
      fichas.push(f)
      usados.set(s, f)
    }
    // 12 algarismos significativos guardam o valor inteiro (as exatas têm menos)
    const valor = numeroTexto(k.valor, 12)
    fatos.push({
      ...notaVazia('fato'),
      titulo: `${k.nome[0].toUpperCase()}${k.nome.slice(1)} (CODATA 2018)`,
      formulas: [`${s} = ${valor}`],
      fonte: 'CODATA 2018 — NIST (physics.nist.gov/constants)',
      tags: ['codata', 'constantes'],
      texto:
        `${k.nome[0].toUpperCase()}${k.nome.slice(1)}: ${k.valor.toLocaleString('pt-BR', { maximumSignificantDigits: 12 })} ${k.unidade}.\n` +
        (k.incerteza === 0 ? 'Valor exato (fixado na definição do SI de 2019).' : `Incerteza padrão: ${k.incerteza.toLocaleString('pt-BR')} ${k.unidade}.`),
    })
  }
  return { fichas, fatos }
}
