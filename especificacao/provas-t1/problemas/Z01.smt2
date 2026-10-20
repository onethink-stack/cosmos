; Z01: constantes rígidas
; a = b
; ◇(a ≠ b)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun |c:b| () Obj)
(declare-fun |c:a| () Obj)
(assert (= |c:a| |c:b|))
(assert (exists ((w!1 Mundo)) (not (= |c:a| |c:b|))))
(check-sat)
