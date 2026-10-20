; Satisfazível (f(1) = 0 e f(x) = 1 para x > 5). A "prova" instancia o ∀ em x = 1 e tira a condição
; x > 5: a instância certa é (> 1 5) ⟹ (f 1) > 0. O passo t0 tem de ser recusado.
(set-logic ALL)
(declare-fun f (Real) Real)
(assert (forall ((x Real)) (=> (> x 5.0) (> (f x) 0.0))))
(assert (not (> (f 1.0) 0.0)))
(check-sat)
