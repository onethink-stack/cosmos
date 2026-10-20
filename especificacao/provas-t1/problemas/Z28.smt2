; Z28: ⋂ expandido
; a ∈ A ⋂ B
; a ∉ A
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: unsat
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun pertence (Mundo Obj Obj) Bool)
(declare-fun |c:B| () Obj)
(declare-fun |c:a| () Obj)
(declare-fun w0 () Mundo)
(declare-fun |c:A| () Obj)
(assert (and (pertence w0 |c:a| |c:A|) (pertence w0 |c:a| |c:B|)))
(assert (not (pertence w0 |c:a| |c:A|)))
(check-sat)
