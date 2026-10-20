; Z02: funções de objeto variam com o mundo
; mae(a) = b
; ◇(mae(a) ≠ b)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: sat
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun |c:b| () Obj)
(declare-fun |f:mae/1| (Mundo Obj) Obj)
(declare-fun |c:a| () Obj)
(declare-fun w0 () Mundo)
(assert (= (|f:mae/1| w0 |c:a|) |c:b|))
(assert (exists ((w!1 Mundo)) (not (= (|f:mae/1| w!1 |c:a|) |c:b|))))
(check-sat)
