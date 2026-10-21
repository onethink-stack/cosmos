; tradução t1 do Caderno
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun |p:Feliz/1| (Mundo Obj) Bool)
(declare-fun w0 () Mundo)
(assert (not (=> (forall ((x!1 Obj)) (|p:Feliz/1| w0 x!1))
         (exists ((x!2 Obj)) (|p:Feliz/1| w0 x!2)))))
(check-sat)
