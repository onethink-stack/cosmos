; Satisfazível (p = true). A "prova" supõe ¬p, que não está no problema: a suposição a1 tem de ser recusada.
(set-logic ALL)
(declare-fun p () Bool)
(assert p)
(check-sat)
