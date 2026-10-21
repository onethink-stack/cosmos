; tradução t1 do Caderno
(set-logic ALL)
(declare-fun |c:n| () Real)
(declare-fun |c:m| () Real)
(assert (> |c:n| 2.0))
(assert (= |c:m| (+ |c:n| 1.0)))
(assert (not (> |c:m| 3.0)))
(check-sat)
