; Z34: raiz de 2 nos inteiros
; ∃x∈ℤ x · x = 2
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(assert (exists ((x!1 Real)) (and (is_int x!1) (= (* x!1 x!1) 2.0))))
(check-sat)
