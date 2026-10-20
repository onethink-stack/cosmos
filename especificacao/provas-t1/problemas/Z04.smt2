; Z04: predicados variam com o mundo
; P(a)
; ◇¬P(a)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: sat
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun |p:P/1| (Mundo Obj) Bool)
(declare-fun |c:a| () Obj)
(declare-fun w0 () Mundo)
(assert (|p:P/1| w0 |c:a|))
(assert (exists ((w!1 Mundo)) (not (|p:P/1| w!1 |c:a|))))
(check-sat)
