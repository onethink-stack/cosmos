; Z27: ⊆ expandido
; A ⊆ B
; a ∈ A
; a ∉ B
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun pertence (Mundo Obj Obj) Bool)
(declare-fun |c:B| () Obj)
(declare-fun w0 () Mundo)
(declare-fun |c:A| () Obj)
(declare-fun |c:a| () Obj)
(assert (forall ((z!1 Obj)) (=> (pertence w0 z!1 |c:A|) (pertence w0 z!1 |c:B|))))
(assert (pertence w0 |c:a| |c:A|))
(assert (not (pertence w0 |c:a| |c:B|)))
(check-sat)
