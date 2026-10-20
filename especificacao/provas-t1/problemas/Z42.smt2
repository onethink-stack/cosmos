; Z42: função numérica quantificada
; ∀x∈ℝ f(x) = x · x
; f(3) ≠ 9
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-fun |fn:f/1| (Real) Real)
(assert (forall ((x!1 Real)) (= (|fn:f/1| x!1) (* x!1 x!1))))
(assert (not (= (|fn:f/1| 3.0) 9.0)))
(check-sat)
