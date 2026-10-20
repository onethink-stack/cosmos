; Z32: número mais um
; n + 1 = n
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-fun |n:n| () Real)
(assert (= (+ |n:n| 1.0) |n:n|))
(check-sat)
