; Z37: quadrado não negativo
; ¬∀x∈ℝ x · x ≥ 0
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(assert (not (forall ((x!1 Real)) (>= (* x!1 x!1) 0.0))))
(check-sat)
