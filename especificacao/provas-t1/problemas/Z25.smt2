; Z25: igualdade e substituição
; a = b
; P(a)
; ¬P(b)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun |c:b| () Obj)
(declare-fun |c:a| () Obj)
(declare-fun |p:P/1| (Mundo Obj) Bool)
(declare-fun w0 () Mundo)
(assert (= |c:a| |c:b|))
(assert (|p:P/1| w0 |c:a|))
(assert (not (|p:P/1| w0 |c:b|)))
(check-sat)
