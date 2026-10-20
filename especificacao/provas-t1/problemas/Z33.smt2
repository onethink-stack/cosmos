; Z33: raiz de 2 nos reais
; n · n = 2
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: sat
(set-logic ALL)
(declare-fun |n:n| () Real)
(assert (= (* |n:n| |n:n|) 2.0))
(check-sat)
