; Contraexemplo do GPT (rodada 28), refeito com nomes da t1: |and| é uma função declarada, não a conjunção.
; Com a tabela fixada abaixo, este problema é satisfazível e o par (and-declarado-b) não é; o comparador
; anterior os dava como iguais, porque achatava |and| como se fosse o and embutido.
(set-logic ALL)
(declare-sort Mundo 0)
(declare-fun w0 () Mundo)
(declare-fun |and| (Bool Bool) Bool)
(declare-fun |p:A/0| (Mundo) Bool)
(declare-fun |p:B/0| (Mundo) Bool)
(declare-fun |p:C/0| (Mundo) Bool)
(assert (= (|and| true false) true))
(assert (= (|and| false false) true))
(assert (= (|and| true true) false))
(assert (|p:A/0| w0))
(assert (not (|p:B/0| w0)))
(assert (not (|p:C/0| w0)))
(assert (|and| (|and| (|p:A/0| w0) (|p:B/0| w0)) (|p:C/0| w0)))
