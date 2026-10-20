; Satisfazível nos reais (x = 1/2, y = 0), não nos inteiros. A "prova" aplica arith-leq-norm, que só vale
; para Int (x ≤ y sse ¬(x ≥ y + 1)), a dois reais: o passo t0 tem de ser recusado, mesmo com
; --allow-int-real-subtyping ligado.
(set-logic ALL)
(declare-fun x () Real)
(declare-fun y () Real)
(assert (not (<= x y)))
(assert (not (>= x (+ y 1))))
(check-sat)
