; Satisfazível (p = false). A "prova" usa a regra p-e-verdade (p = true para qualquer p), que é falsa e não
; está no arquivo de regras do verificador. Ela vem com o próprio arquivo de regras (atacante.rare): o
; verificador tem de usar o dele e recusar. Com o arquivo do atacante, o Carcara aceitaria.
(set-logic ALL)
(declare-fun p () Bool)
(assert (not p))
(check-sat)
