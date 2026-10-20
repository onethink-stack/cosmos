; Z39: divisão por zero dá algum número
; n / 0 = 5
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: sat
(set-logic ALL)
(declare-fun |n:n| () Real)
(assert (= (/ |n:n| 0.0) 5.0))
(check-sat)
