; Z06: funções numéricas rígidas
; f(n) = 1
; ◇(f(n) ≠ 1)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-sort Mundo 0)
(declare-fun |fn:f/1| (Real) Real)
(declare-fun |n:n| () Real)
(assert (= (|fn:f/1| |n:n|) 1.0))
(assert (exists ((w!1 Mundo)) (not (= (|fn:f/1| |n:n|) 1.0))))
(check-sat)
