; Z35: raiz de 2 com ∃x∈ℝ
; ∃x∈ℝ x · x = 2
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: sat
(set-logic ALL)
(assert (exists ((x!1 Real)) (= (* x!1 x!1) 2.0)))
(check-sat)
