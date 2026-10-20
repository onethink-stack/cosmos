; Z40: divisão por zero é função do numerador
; n / 0 = 5
; m / 0 = 7
; n = m
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-fun |n:n| () Real)
(declare-fun |n:m| () Real)
(assert (= (/ |n:n| 0.0) 5.0))
(assert (= (/ |n:m| 0.0) 7.0))
(assert (= |n:n| |n:m|))
(check-sat)
