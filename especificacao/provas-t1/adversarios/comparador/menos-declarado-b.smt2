; Par de menos-declarado-a: -(6)/2 = 4, que com -(6) = 0 é falso. Insatisfazível.
(set-logic ALL)
(declare-sort Mundo 0)
(declare-fun w0 () Mundo)
(declare-fun |-| (Real) Real)
(assert (= (|-| 6.0) 0.0))
(assert (= (/ (- 6.0) 2.0) 4.0))
