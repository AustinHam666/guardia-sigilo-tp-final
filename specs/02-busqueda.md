# Spec 02 — Algoritmos de búsqueda

## Objetivo
Calcular el camino del guardia con tres algoritmos seleccionables en juego,
para observar y explicar sus diferencias.

## Comportamiento esperado
- Algoritmos: BFS, Dijkstra y A*. La tecla Espacio los recorre en ese orden.
- Cuadrícula de 4 vecinos (norte, este, sur, oeste), sin diagonales.
- Todos reciben mapa, inicio, meta y una función de costo de entrada por celda.
  - BFS ignora los costos: minimiza la cantidad de pasos (cola FIFO).
  - Dijkstra minimiza el costo acumulado (cola de prioridad por g).
  - A* minimiza el costo acumulado usando g + h, con h = distancia Manhattan,
    admisible porque el costo mínimo de una celda es 1.
- Resultado común: estado (`exito`, `inaccesible`, `inicio-invalido`,
  `meta-invalida`), ruta (incluye inicio y meta), pasos, costo real de la ruta
  según el terreno, nodos expandidos, frontera máxima y nodos explorados.
- El costo informado es siempre la suma real de costos de entrada de la ruta,
  también para BFS, para poder comparar honestamente.
- Se rechazan costos menores que 1 o no finitos.

## Fuera de alcance
DFS, diagonales, búsqueda jerárquica, suavizado de rutas.

## Cómo comprobarlo
- Fixture 5x3 libre, S=(0,1), G=(4,1): los tres devuelven 4 pasos y costo 4.
- Mismo fixture con barro (costo 5) en (1,1), (2,1), (3,1): BFS devuelve la
  ruta directa (4 pasos, costo 16); Dijkstra y A* devuelven un rodeo de 6 pasos
  y costo 6.
- A* expande igual o menos nodos que Dijkstra con el mismo costo óptimo.
- Inicio = meta → éxito con costo 0; barrera completa → `inaccesible`;
  extremos fuera del mapa o en pared → inválidos.
- Jugando: con T se ven los nodos explorados; al cambiar de algoritmo cambia
  la mancha de exploración y, si hay barro en el camino, la ruta.
