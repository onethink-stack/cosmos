# COSMOS — hub de registros

Frontend estático isolado, a partir de `2cd8b64`. Não modifica nem importa o
motor, o verificador ou o conteúdo cifrado do Principia.

Na raiz desta cópia do repositório, execute:

```sh
python -m http.server 8765 --bind 127.0.0.1
```

Abra http://127.0.0.1:8765/hub/ . O servidor deve servir a raiz para que a
interface leia `../FORMATO_v1.md` por HTTP. Abrir `index.html` diretamente por
`file://` pode impedir essa leitura; nesse caso a tela informa a indisponibilidade.

- Nova nota, edição, exclusão, busca e filtros operam sobre rascunhos locais.
- As categorias visuais não modificam nem substituem os 13 campos do registro.
- `localStorage` guarda apenas as notas criadas pela pessoa. Não há notas de exemplo.
- O acesso “Sistemas prontos” consulta a estrutura pública; não ativa sistemas.
- A chave do Principia fica em `sessionStorage`, em texto acessível ao próprio
  navegador, e pode ser esquecida pela interface. Não é um cofre de senhas.
  A interface não testa a chave, não descriptografa e não abre o núcleo.
- Não há scripts, fontes remotas ou chamadas de rede externas; somente a
  leitura local de FORMATO_v1.md e dos próprios arquivos estáticos.
- Corpus real PT (100 perguntas humanas) PENDENTE - não gerar sintético.

O logotipo em `assets/cosmos.png` foi editado pela ferramenta integrada de
imagem a partir da referência fornecida. Prompt: remover somente o fundo
preto dos cantos externos e substituí-lo por branco, preservando o símbolo C
central, sem texto, formas adicionais ou sombras. Nenhuma edição do núcleo.

Esta entrega é de interface. Conferir suas interações não é conferir provas
matemáticas e não implica resultado novo de CI.
