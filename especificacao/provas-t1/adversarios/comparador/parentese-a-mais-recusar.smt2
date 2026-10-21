; Um ) a mais, que fecha a raiz no meio do problema. O leitor do vínculo quebrava com IndexError (fora do
; ValueError que a comparação esperava) e derrubava a conferência inteira; agora o problema é recusado, como
; fora do perfil, e a comparação falha fechada.
(set-logic ALL)
(declare-sort Obj 0)
(declare-sort Mundo 0)
(declare-fun |p:P/1| (Mundo Obj) Bool)
(declare-fun |c:a| () Obj)
(declare-fun w0 () Mundo)
(assert (|p:P/1| w0 |c:a|)))
(assert (|p:P/1| w0 |c:a|))
(check-sat)
