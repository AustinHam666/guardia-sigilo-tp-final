# Spec 03 — Alternativas de navegación

## Objetivo
Ofrecer dos formas de elegir y recorrer la ruta, seleccionables con la tecla N,
para que el guardia responda distinto al terreno. Cambiar de algoritmo no
cuenta como alternativa de navegación: esto cambia el modelo de costos.

## Comportamiento esperado
- **Ruta corta:** todas las celdas transitables cuestan 1. El guardia toma el
  camino con menos pasos aunque cruce el barro.
- **Ruta por terreno:** el barro cuesta 5. El guardia prefiere rodearlo si el
  rodeo cuesta menos.
- En ambas alternativas el barro reduce físicamente la velocidad del guardia
  al 40 %; por eso la ruta corta puede ser más lenta en tiempo real.
- La ruta por terreno sólo tiene efecto con algoritmos que admiten costos
  (Dijkstra y A*). Con BFS el HUD avisa "BFS ignora costos".
- La ruta se calcula sólo ante un cambio relevante: nuevo destino, cambio de
  algoritmo o de alternativa, o nuevo mapa. No se recalcula en cada cuadro.
- Seguimiento: el guardia avanza por los puntos de la ruta con
  `advanceAlongPath`, independiente de la tasa de cuadros.

## Fuera de alcance
Evasión local de obstáculos dinámicos, steering con aceleración, diagonales.

## Cómo comprobarlo
- Prueba: con barro entre el guardia y su destino, la ruta corta cruza el barro
  y la ruta por terreno lo evita (mapa construido para la prueba).
- Prueba: sin cambios de destino ni configuración, diez actualizaciones no
  generan búsquedas nuevas; cambiar la alternativa genera exactamente una.
- Jugando: con T activado, presionar N cambia la línea de la ruta cuando hay
  barro en el trayecto; si no hay barro, ambas rutas pueden coincidir.
