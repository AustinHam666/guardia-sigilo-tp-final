# Spec 01 — Generador de escenarios

## Objetivo
Generar con una semilla un mapa pequeño (30x20) distinto en cada partida, que
cambie las rutas posibles del guardia y del jugador, y que siempre sea válido
y jugable.

## Comportamiento esperado
- El borde del mapa es pared.
- Se ubican al azar entre 14 y 20 muros rectos (barras horizontales o
  verticales de 3 a 8 celdas, con grosor 1 o 2).
- Se ubican entre 3 y 5 zonas de barro rectangulares sobre celdas libres.
  El barro es transitable (no es pared).
- Se eligen en celdas libres y distintas entre sí: inicio del jugador, inicio
  del guardia, llave, salida y 3 o 4 puntos de patrulla.
- Distancias mínimas (Manhattan): guardia–jugador >= 12, llave–jugador >= 8,
  salida–llave >= 8, entre puntos de patrulla >= 6.
- Reglas de validez, comprobadas con BFS:
  - existe camino jugador → llave y llave → salida;
  - existe camino guardia → primer punto de patrulla;
  - existe camino entre cada par de puntos de patrulla consecutivos (circuito).
- Si una variante no cumple las reglas se descarta y se intenta otra
  (hasta 50 intentos). Si todas fallan se usa un mapa base válido conocido.
- Misma semilla → mismo mapa (generador pseudoaleatorio determinista).
- El resultado informa la semilla, la cantidad de intentos y si se usó el
  mapa base.

## Fuera de alcance
Editor de niveles, mapas diseñados a mano, salas o pasillos con forma de
mazmorra, decoración.

## Cómo comprobarlo
- Prueba automatizada: 500 semillas generan mapas que cumplen todas las reglas.
- Prueba automatizada: la misma semilla produce el mismo mapa y semillas
  distintas producen mapas distintos.
- Jugando: la tecla G genera otra variante; la semilla y los intentos se ven en
  el HUD; muros, barro, llave, salida y patrulla cambian de lugar.
