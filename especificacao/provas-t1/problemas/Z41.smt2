; Z41: função numérica é função
; f(1) = 2
; f(1) = 3
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-fun |fn:f/1| (Real) Real)
(assert (= (|fn:f/1| 1.0) 2.0))
(assert (= (|fn:f/1| 1.0) 3.0))
(check-sat)
