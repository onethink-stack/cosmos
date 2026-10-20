; Z05: constantes numéricas rígidas
; n = 1
; ◇(n ≠ 1)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-sort Mundo 0)
(declare-fun |n:n| () Real)
(assert (= |n:n| 1.0))
(assert (exists ((w!1 Mundo)) (not (= |n:n| 1.0))))
(check-sat)
