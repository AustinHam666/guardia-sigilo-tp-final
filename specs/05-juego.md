# Spec 05 — Bucle de juego, controles y HUD

## Objetivo
Que el prototipo se pueda jugar y que las alternativas se puedan activar y
observar sin tocar código.

## Comportamiento esperado
- El jugador se mueve con WASD o flechas y choca con las paredes.
- Tomar la llave (pasar por su celda) la marca como obtenida.
- Llegar a la salida con la llave → VICTORIA. Si el guardia toca al jugador
  (distancia < 0,6 celdas) → ATRAPADO. En ambos casos el juego se detiene
  hasta presionar R (misma semilla) o G (nueva semilla).
- Controles: Espacio (algoritmo), N (navegación), G (nuevo escenario),
  R (reiniciar), Q (ruido), T (depuración).
- El algoritmo, la navegación y la depuración se conservan al cambiar de mapa.
- HUD: algoritmo, navegación, estado del guardia, último cambio de estado,
  pasos y costo de la ruta actual, nodos expandidos, semilla e intentos,
  objetivo del jugador.
- Depuración (T): nodos explorados, ruta completa, puntos de patrulla
  numerados y última posición conocida.

## Fuera de alcance
Menús, puntaje, sonido real, varios niveles encadenados.

## Cómo comprobarlo
- Jugando: cada tecla cambia lo indicado en el HUD.
- Victoria y derrota detienen el juego y se reanudan con R o G.
