; R27: as premissas e a negação da fórmula
; Q(n)
; ¬(∃x∈ℝ Q(x))
; tradução t1 do Caderno
(set-logic ALL)
(declare-sort Mundo 0)
(declare-fun |p:Q/1:R| (Mundo Real) Bool)
(declare-fun |n:n| () Real)
(declare-fun w0 () Mundo)
(assert (|p:Q/1:R| w0 |n:n|))
(assert (not (exists ((x!1 Real)) (|p:Q/1:R| w0 x!1))))
(check-sat)
