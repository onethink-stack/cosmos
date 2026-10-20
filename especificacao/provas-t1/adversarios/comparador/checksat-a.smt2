; Contraexemplo do GPT (rodada 29): o check-sat no meio. A consulta só vê a primeira asserção, então este problema
; é satisfazível e o par (checksat-b) não é; o comparador anterior olhava só o conjunto das asserções e os dava
; como iguais.
(set-logic ALL)
(assert true)
(check-sat)
(assert false)
