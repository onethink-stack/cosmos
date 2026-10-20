; Contraexemplo do GPT (rodada 28), refeito: |-| é uma função declarada, não a negação. Com -(6) = 0,
; este problema (-(3) = 4) é satisfazível e o par (menos-declarado-b) não é; o comparador anterior lia
; (- 3.0) e (/ (- 6.0) 2.0) como o número -3 nos dois.
(set-logic ALL)
(declare-sort Mundo 0)
(declare-fun w0 () Mundo)
(declare-fun |-| (Real) Real)
(assert (= (|-| 6.0) 0.0))
(assert (= (- 3.0) 4.0))
