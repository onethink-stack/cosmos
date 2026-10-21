; R05: as premissas, sozinhas
; A
; ¬A
; tradução t1 do Caderno
(set-logic ALL)
(declare-sort Mundo 0)
(declare-fun |p:A/0| (Mundo) Bool)
(declare-fun w0 () Mundo)
(assert (|p:A/0| w0))
(assert (not (|p:A/0| w0)))
(check-sat)
