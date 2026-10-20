; Z30: ∅ ⊆ qualquer conjunto
; ¬(∅ ⊆ A)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun pertence (Mundo Obj Obj) Bool)
(declare-fun |c:A| () Obj)
(declare-fun w0 () Mundo)
(assert (not (forall ((z!1 Obj)) (=> false (pertence w0 z!1 |c:A|)))))
(check-sat)
