; Z31: ∀x∈S expandido
; ∀x∈A P(x)
; a ∈ A
; ¬P(a)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun |p:P/1| (Mundo Obj) Bool)
(declare-fun w0 () Mundo)
(declare-fun pertence (Mundo Obj Obj) Bool)
(declare-fun |c:A| () Obj)
(declare-fun |c:a| () Obj)
(assert (forall ((x!1 Obj)) (=> (pertence w0 x!1 |c:A|) (|p:P/1| w0 x!1))))
(assert (pertence w0 |c:a| |c:A|))
(assert (not (|p:P/1| w0 |c:a|)))
(check-sat)
