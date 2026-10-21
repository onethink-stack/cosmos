; R06: as premissas e a negação da fórmula
; ¬((∀x P(x)) ⟹ P(a))
; tradução t1 do Caderno
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun |p:P/1| (Mundo Obj) Bool)
(declare-fun |c:a| () Obj)
(declare-fun w0 () Mundo)
(assert (not (=> (forall ((x!1 Obj)) (|p:P/1| w0 x!1)) (|p:P/1| w0 |c:a|))))
(check-sat)
