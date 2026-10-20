; Satisfazível (p = true, q = false, r = true). A "prova" junta (p ∨ q) e (¬p ∨ r) e conclui q,
; mas o resolvente certo é q ∨ r: o passo t2 tem de ser recusado pelos pivôs e por RUP.
(set-logic ALL)
(declare-fun p () Bool)
(declare-fun q () Bool)
(declare-fun r () Bool)
(assert (or p q))
(assert (or (not p) r))
(assert (not q))
(check-sat)
