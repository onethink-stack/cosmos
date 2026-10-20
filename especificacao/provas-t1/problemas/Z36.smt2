; Z36: potência à direita
; ¬(2^3^2 = 512)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(assert (not (= (^ 2.0 (* 3.0 3.0)) 512.0)))
(check-sat)
