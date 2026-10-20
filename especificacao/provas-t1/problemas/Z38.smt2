; Z38: ímpar não é dobro
; ¬∀x∈ℤ 2 · x ≠ 1
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(assert (let ((a!1 (forall ((x!1 Real)) (=> (is_int x!1) (not (= (* 2.0 x!1) 1.0))))))
  (not a!1)))
(check-sat)
