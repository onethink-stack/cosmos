; tradução t1 do Caderno
(set-logic ALL)
(declare-fun |n:n| () Real)
(declare-fun |n:m| () Real)
(assert (> |n:n| 2.0))
(assert (= |n:m| (+ |n:n| 1.0)))
(assert (not (> |n:m| 3.0)))
(check-sat)
