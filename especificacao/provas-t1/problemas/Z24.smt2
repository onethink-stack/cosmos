; Z24: domínio não vazio
; ∀x P(x)
; ∀x ¬P(x)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun |p:P/1| (Mundo Obj) Bool)
(declare-fun w0 () Mundo)
(assert (forall ((x!1 Obj)) (|p:P/1| w0 x!1)))
(assert (forall ((x!2 Obj)) (not (|p:P/1| w0 x!2))))
(check-sat)
