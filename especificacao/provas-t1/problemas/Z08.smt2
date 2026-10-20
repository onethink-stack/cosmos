; Z08: predicado com argumento numérico varia com o mundo
; Q(1)
; ◇¬Q(1)
; tradução t1 do Caderno; veredito do Z3 5.1.0.0: sat
(set-logic ALL)
(declare-sort Mundo 0)
(declare-fun |p:Q/1:R| (Mundo Real) Bool)
(declare-fun w0 () Mundo)
(assert (|p:Q/1:R| w0 1.0))
(assert (exists ((w!1 Mundo)) (not (|p:Q/1:R| w!1 1.0))))
(check-sat)
