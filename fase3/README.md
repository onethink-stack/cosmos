# Fase 3: cadeia pessoal por arquivo

Implementacao independente sobre o commit publico
`17a016817c539658d4a92c01d8cb5284333ff115`. Nao importa nenhum modulo de
`src/` ou `servidor/`. O verificador publico de registros e seu comparador
da secao 5.1 permanecem sem alteracoes. Dominio continua texto livre.

## Executar

Python 3.12 ou superior. Na raiz do repositorio:

```sh
python -m pip install -r fase3/requirements.txt
python -X utf8 -m unittest discover -s fase3 -p 'test_*.py' -v
```

O teste cria A, B e C em diretorios separados, com chaves diferentes, e chama
a CLI em processos separados. Faz as seis transferencias por arquivos reais,
altera exatamente um byte de cada arquivo e exige recusa nos outros dois
receptores. Imprime `troca por arquivo OK em 3/3` e
`deteccao de alteracao 3/3`. O CI executa o mesmo protocolo em Windows e Linux
e guarda o log como artefato. Isso simula tres aparelhos; nao e uma medicao
em tres computadores fisicos.

## Em cada notebook

```sh
python fase3/cadeia.py init aparelho
python fase3/cadeia.py append aparelho registro-com-arquivos.json
python fase3/cadeia.py export aparelho minha-cadeia.json
python fase3/cadeia.py import aparelho cadeia-B.json --public chave-B.txt
python fase3/cadeia.py import aparelho cadeia-C.json --public chave-C.txt
```

`init` cria uma chave privada local (`aparelho/key`), a chave publica
(`aparelho/public.txt`) e uma cadeia vazia. Troque e confira as chaves publicas
com as pessoas antes da primeira importacao: nao use uma chave recebida
somente dentro da propria cadeia como prova de identidade. Proteja a pasta
do aparelho com as permissoes do sistema; a chave privada nao e cifrada.
Cada pasta deve ter um unico processo escritor por vez.

O arquivo de entrada para `append` e JSON UTF-8 com dois campos:
`record` e um registro-v1; `assets` mapeia cada caminho de certificado para
os bytes do arquivo em base64. O `autor` do registro deve ser o SHA-256 dos
32 bytes da chave publica local. Os testes mostram exemplos completos usando
os registros publicos R02 e R01, inclusive os certificados externos de R01.
`append` verifica o registro antes de grava-lo. O arquivo exportado contem
todos os certificados, sem caminhos para arquivos externos ao pacote.

Uma importacao valida grava a cadeia em `aparelho/received/<autor>.json`.
Uma recusa termina com codigo 1 e nao substitui o ultimo recebimento valido.
Importar novamente o mesmo arquivo e permitido; uma extensao preservando
todo o prefixo anterior tambem. Retrocessos e bifurcacoes sao recusados.

## Contrato dos bytes e verificacao

O arquivo e JSON UTF-8, com chaves ordenadas, sem espacos entre campos, sem
escape ASCII de Unicode e com um LF final. O receptor exige exatamente essa
serializacao, inclusive nos campos extras e nas chaves duplicadas. Assim,
alterar apenas a formatacao tambem e detectado.

Cada entrada contem indice, hash anterior, registro e arquivos. O SHA-256
identifica os bytes canonicos desse corpo; Ed25519 assina os mesmos bytes
com o prefixo de separacao de dominio `cadeia-arquivo-v1\0`. Um manifesto
assinado contem versao, autor, quantidade e hash da ultima entrada. Isso
detecta inclusive a remocao do sufixo sem uma nova assinatura do autor.

Depois da criptografia, o verificador publico confere o registro, os hashes
dos arquivos e o vinculo 5.1. Os testes adulteram um problema SMT, refazem seu
hash e assinam novamente a cadeia: os seis receptores recusam com R9.
Tambem cobrem assinatura invalida, hash recomposto, ordem, truncamento,
elo anterior incorreto, chave substituida, autor incorreto, caminhos invalidos,
retrocesso e bifurcacao, alem de extensoes legitimas.

`integridade: OK` nao significa que uma prova matematica pendente foi aceita.
O resultado lista `pendencias` do verificador: sem Carcara, provas Alethe
continuam pendentes, mas seu hash e vinculo sao verificados. Os testes de
troca usam modelos finitos integralmente conferidos, sem pendencias. Registros
fechados conservam o escopo limitado da Fase 2. Esta camada nao introduz um
novo carimbo de aceite matematico.

Sem um recebimento anterior, nao e possivel distinguir uma cadeia antiga
autentica de sua versao mais recente. A memoria local detecta retrocesso
depois do primeiro recebimento; ela precisa ser preservada. Esta entrega nao
inclui carimbo Bitcoin/OpenTimestamps, nem impede reescrita por um autor que
possui a chave antes de qualquer observador guardar a cadeia.
