# GDD — Guardia de Sigilo: IA para NPC con escenarios generados

Programación de IA y Patrones de Comportamiento — UNRaf 2026
Integrante: Austin Ham (individual)
Motor: Phaser 3 + TypeScript

## 1. Idea de juego, escenario y objetivo

Juego de sigilo 2D con vista cenital sobre una cuadrícula de 30x20 celdas. El jugador es un
ladrón que debe tomar una llave y llegar a la salida sin ser atrapado por un guardia. Cada
partida usa un escenario generado de forma procedural: cambian paredes, pasajes, zonas de barro,
posiciones iniciales, llave, salida y puntos de patrulla.

- **Victoria:** tomar la llave y llegar a la salida.
- **Derrota:** el guardia alcanza al jugador.

El objetivo del prototipo no es un juego completo, sino que la IA del guardia se pueda
observar, comparar y explicar jugando.

**Experiencia buscada:** que el jugador pueda leer las intenciones del guardia (patrulla
predecible, color de estado, cono visible) y planificar su recorrido usando paredes para cortar
la línea de visión y ruidos para distraerlo.

## 2. Interacción y controles

| Tecla | Acción |
|---|---|
| WASD / flechas | Mover al jugador |
| Q | Ruido (distractor) en la posición del jugador |
| Espacio | Algoritmo de búsqueda: BFS → Dijkstra → A* |
| N | Alternativa de navegación: ruta corta ↔ ruta por terreno |
| G | Generar otra variante (muestra la semilla) |
| R | Reiniciar la misma variante |
| T | Depuración: nodos explorados, ruta, patrulla, memoria |

El HUD muestra algoritmo, navegación, estado del guardia y último cambio, pasos y costo de la
ruta, nodos expandidos, semilla e intentos, y el objetivo del jugador.

## 3. NPC: el guardia

### Percepción
- **Visión:** cono de 90° y alcance de 7 celdas, bloqueado por paredes (oclusión por celdas).
- **Oído:** percibe ruidos de radio 6 celdas durante 0,6 s.
- Visión tiene prioridad sobre sonido.

### Memoria
Última posición conocida del jugador e instante de la observación. Sólo cambia ante una
percepción válida: el guardia nunca usa la posición real del jugador si no lo vio ni lo oyó.

### Objetivos
Recorrer su circuito de patrulla, investigar ruidos, atrapar al jugador cuando lo detecta y
buscarlo durante un tiempo limitado antes de volver a patrullar.

### Comportamiento: máquina de estados finitos
Se eligió una FSM porque el guardia tiene cinco modos reconocibles, fáciles de leer para el
jugador y de probar estado por estado.

| Origen | Evento / condición | Destino | Acción |
|---|---|---|---|
| Cualquiera | Ve al jugador | Perseguir | Recordar posición; ruta hacia el jugador |
| Perseguir | Pierde la visión | Investigar | Ir a la última posición conocida |
| Patrullar / Regresar / Buscar | Oye un ruido | Investigar | Ir al origen del ruido |
| Investigar | Llega al destino | Buscar | Girar la mirada durante 3 s |
| Buscar | Se agota el tiempo | Regresar | Ir al punto de patrulla más cercano |
| Regresar | Llega al punto | Patrullar | Continuar el circuito |
| Investigar | Destino sin camino | Regresar | No avanza; registra "inaccesible" |
| Patrullar / Regresar | Punto sin camino | Patrullar | Salta al siguiente punto; si ninguno es alcanzable, espera |

## 4. Búsqueda

Tres algoritmos seleccionables en juego, sobre una cuadrícula de 4 vecinos:

- **BFS:** cola FIFO; garantiza la menor cantidad de pasos sólo si todos cuestan lo mismo.
  Ignora los costos de terreno.
- **Dijkstra:** expande por costo acumulado; garantiza el menor costo con pesos positivos, pero
  explora en todas las direcciones.
- **A\*:** costo acumulado más heurística Manhattan (admisible con 4 vecinos y costo mínimo 1);
  obtiene el mismo costo óptimo que Dijkstra expandiendo menos nodos.

Con la depuración se ven los nodos explorados, los pasos y el costo de cada ruta. Las rutas
pueden coincidir cuando no hay barro en el trayecto.

## 5. Navegación

Dos alternativas seleccionables con N. Cambiar de algoritmo no cuenta como alternativa: lo que
cambia aquí es el modelo de costos con el que se elige la ruta.

- **Ruta corta:** todas las celdas transitables cuestan 1; el guardia toma el camino directo
  aunque cruce el barro.
- **Ruta por terreno:** el barro cuesta 5; el guardia lo rodea si el rodeo cuesta menos.
  Requiere Dijkstra o A*, que admiten costos.

En ambas, el barro reduce la velocidad del guardia al 40 %, así que la ruta corta puede tardar
más en tiempo real y dar ventaja al jugador. El seguimiento de la ruta es por puntos de paso y
se recalcula sólo ante un cambio relevante (nuevo destino, cambio de configuración o de mapa).

## 6. Escenarios variables y patrullaje

### Qué varía con cada semilla
Entre 14 y 20 muros rectos, entre 3 y 5 zonas de barro, posiciones del jugador, del guardia, de
la llave, de la salida y de 3 o 4 puntos de patrulla.

### Reglas de validez (comprobadas con BFS)
- Entidades en celdas transitables, fuera del barro y sin superponerse.
- Distancias mínimas: guardia–jugador ≥ 12, llave–jugador ≥ 8, salida–llave ≥ 8, entre puntos de
  patrulla ≥ 6.
- Debe existir camino jugador → llave → salida, guardia → patrulla y entre todos los puntos de
  patrulla consecutivos.
- Si una variante no cumple, se descarta y se genera otra (hasta 50 intentos); si todas fallan,
  se usa un mapa base válido.
- La misma semilla genera el mismo mapa, para poder repetir una prueba.

### Patrullaje adaptado
Los puntos de patrulla se eligen entre celdas válidas del mapa generado y las rutas entre ellos
se calculan con el algoritmo y la navegación activos. No hay trayectorias fijas preparadas.

## 7. Alcance y límites

**Incluido:** un guardia con FSM de cinco estados, percepción y memoria; tres algoritmos y dos
alternativas de navegación seleccionables; generador con semilla y validación; HUD y
depuración; specs y pruebas automatizadas.

**Fuera de alcance:** varios guardias coordinados, combate, inventario, niveles diseñados a
mano, animaciones, arte elaborado y sonido real.

**Caso límite:** si el destino del guardia queda sin camino (por ejemplo, un ruido en una zona
aislada), el guardia no atraviesa paredes ni se traba: permanece en un lugar válido, registra
"inaccesible" y regresa a su patrulla.

## 8. Desarrollo

GDD → specs en `specs/` → implementación de a una funcionalidad → pruebas automatizadas y
prueba jugando. Orden seguido: búsqueda, generador de escenarios, FSM, navegación y agente,
escena y HUD.
