; R22: as premissas e a negação da fórmula
; A
; ¬A
; ¬(B)
; tradução t1 do Caderno
(set-logic ALL)
(declare-sort Mundo 0)
(declare-fun |p:A/0| (Mundo) Bool)
(declare-fun w0 () Mundo)
(declare-fun |p:B/0| (Mundo) Bool)
(assert (|p:A/0| w0))
(assert (not (|p:A/0| w0)))
(assert (not (|p:B/0| w0)))
(check-sat)
