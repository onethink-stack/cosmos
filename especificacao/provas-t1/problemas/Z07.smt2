; Z07: função de objeto com argumento numérico varia com o mundo
; g(n, a) = b
; ◇(g(n, a) ≠ b)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: sat
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun |c:b| () Obj)
(declare-fun |f:g/2:RO| (Mundo Real Obj) Obj)
(declare-fun |c:a| () Obj)
(declare-fun |n:n| () Real)
(declare-fun w0 () Mundo)
(assert (= (|f:g/2:RO| w0 |n:n| |c:a|) |c:b|))
(assert (exists ((w!1 Mundo)) (not (= (|f:g/2:RO| w!1 |n:n| |c:a|) |c:b|))))
(check-sat)
