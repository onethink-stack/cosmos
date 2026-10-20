; Z03: ∈ varia com o mundo
; a ∈ A
; ◇(a ∉ A)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: sat
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun pertence (Mundo Obj Obj) Bool)
(declare-fun |c:A| () Obj)
(declare-fun |c:a| () Obj)
(declare-fun w0 () Mundo)
(assert (pertence w0 |c:a| |c:A|))
(assert (exists ((w!1 Mundo)) (not (pertence w!1 |c:a| |c:A|))))
(check-sat)
