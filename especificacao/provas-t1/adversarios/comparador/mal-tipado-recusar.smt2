; Achado do GPT (rodada 30): um termo mal tipado. |c:a| é um objeto, e and pede Bool. Um leitor SMT recusa este
; problema, e o perfil da t1 também tem de recusar, antes de qualquer comparação.
(set-logic ALL)
(declare-sort Obj 0)
(declare-const |c:a| Obj)
(assert (and |c:a| true))
