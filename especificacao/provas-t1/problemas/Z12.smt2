; Z12: S5: axioma 4
; ¬(□P(a) ⟹ □□P(a))
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun |p:P/1| (Mundo Obj) Bool)
(declare-fun |c:a| () Obj)
(assert (let ((a!1 (=> (forall ((w!1 Mundo)) (|p:P/1| w!1 |c:a|))
               (forall ((w!2 Mundo)) (forall ((w!3 Mundo)) (|p:P/1| w!3 |c:a|))))))
  (not a!1)))
(check-sat)
