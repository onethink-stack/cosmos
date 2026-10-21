# Licenças do Caderno Lógico

Caderno Lógico — Copyright © 2026 Gustavo Phadua Silva da Costa e os autores do
Caderno Lógico.

Os autores do Caderno Lógico são as pessoas que contribuíram com o projeto. O
histórico do Git diz quem fez o quê.

| O quê | Licença | Texto |
| --- | --- | --- |
| O código: tudo o que não está nas linhas abaixo | GNU Affero General Public License, versão 3 ou posterior (AGPL-3.0-or-later) | [LICENSE](LICENSE) |
| A pasta `especificacao/` (especificações, exemplos normativos e certificados), menos as exceções abaixo, e os textos `.md` | Creative Commons Atribuição 4.0 Internacional (CC BY 4.0) | [LICENSES/CC-BY-4.0.txt](LICENSES/CC-BY-4.0.txt) |
| `especificacao/provas-t1/conferir.py`, `vinculo.py`, `modelos.py` e `registros.py` | AGPL-3.0-or-later (é código) | [LICENSE](LICENSE) |
| `especificacao/provas-t1/independente/` (o código que o GPT, da OpenAI, escreveu a pedido do autor, só pela especificação; veja o README da pasta) | AGPL-3.0-or-later (é código) | [LICENSE](LICENSE) |
| `especificacao/provas-t1/regras.rare` | Apache-2.0 (vem do Carcara) | [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |
| Axiomas e teorias publicados neste repositório | CC BY 4.0 | [LICENSES/CC-BY-4.0.txt](LICENSES/CC-BY-4.0.txt) |
| `src/dados/cifrado/principia.json` | Nenhuma: todos os direitos reservados | — |
| Outros arquivos e dados de terceiros | A licença de cada um | [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |

## O código

O aviso que a licença pede, no original:

```
Caderno Lógico
Copyright (C) 2026 Gustavo Phadua Silva da Costa e os autores do Caderno Lógico

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
```

Em português, sem valor de licença (o que vale é o texto do [LICENSE](LICENSE)):
o Caderno Lógico é software livre. Você pode redistribuí-lo e modificá-lo nos
termos da AGPL, versão 3 ou, a seu critério, qualquer versão posterior. Ele vem
sem nenhuma garantia.

Quem modificar o Caderno e oferecer a versão modificada como serviço na rede
(um nó, um validador, um site) tem de oferecer o código-fonte dessa versão a
quem usa o serviço (seção 13 da licença). O código desta versão está em
<https://github.com/onethink-stack/cosmos>.

## Especificações, exemplos e textos

Pela CC BY 4.0, qualquer pessoa pode copiar, distribuir e adaptar esse
material, inclusive para uso comercial, desde que dê o crédito: o nome dos
autores, o aviso de direitos, a referência à licença e à ausência de garantias,
um link para o material e a indicação do que mudou.

Crédito sugerido: "Caderno Lógico, © 2026 Gustavo Phadua Silva da Costa e os
autores do Caderno Lógico, CC BY 4.0, https://github.com/onethink-stack/cosmos".

## O Principia

O arquivo `src/dados/cifrado/principia.json` guarda, cifrado, o Principia do
autor. Ele não está sob nenhuma das licenças deste repositório: todos os
direitos são reservados ao autor. O texto em claro não está no repositório, e
copiar o arquivo cifrado não dá direito nenhum sobre o conteúdo.

## Contribuições

Quem contribui licencia a contribuição nos mesmos termos: AGPL-3.0-or-later
para código, CC BY 4.0 para textos e axiomas. Cada commit leva a assinatura da
DCO. O passo a passo está em [CONTRIBUTING.md](CONTRIBUTING.md).
