# Guardia de Sigilo — IA para NPC con escenarios generados

TP final integrador de **Programación de IA y Patrones de Comportamiento** (UNRaf, 2026).

**Integrante:** Austin Ham (individual)

Prototipo de sigilo 2D con vista cenital: el jugador tiene que tomar una llave y llegar a la
salida sin que lo atrape un guardia. El guardia **percibe** (visión con oclusión y oído),
**recuerda** la última posición conocida del jugador, **decide** con una máquina de estados
(patrullar, investigar, perseguir, buscar, regresar) y **navega** con el algoritmo de búsqueda
y la alternativa de navegación elegidos. Cada partida se juega sobre un **escenario generado
proceduralmente**, validado para que siempre sea jugable.

- 📄 [GDD](GDD.md)
- 📐 [Specs](specs/)
- 🎤 [Presentación](docs/presentacion.html) (abrir en el navegador; flechas para avanzar)

## Requisitos y ejecución

- Node.js 22 o superior (probado con 22 y 24).

```bash
npm install
npm run dev        # abre http://localhost:5173
```

Otros comandos:

```bash
npm run validate   # tipos + pruebas automatizadas + build
npm run build      # genera la versión ejecutable en dist/
npm run preview    # sirve dist/ en http://localhost:4173
```

## Controles

| Tecla | Acción |
|---|---|
| WASD / flechas | Mover al jugador |
| Q | Hacer un ruido (el guardia lo investiga si lo oye) |
| **Espacio** | Cambiar algoritmo de búsqueda: BFS → Dijkstra → A* |
| **N** | Cambiar alternativa de navegación: ruta corta ↔ ruta por terreno |
| **G** | Generar otro escenario (nueva semilla) |
| R | Reiniciar el mismo escenario |
| T | Mostrar/ocultar depuración (nodos explorados, ruta, puntos de patrulla, última posición conocida) |

El algoritmo, la navegación y la depuración se conservan al generar otro mapa.

También se puede abrir una configuración concreta desde la URL, útil para repetir un caso:
`http://localhost:5173/?seed=12345&algo=bfs&nav=corta` (`algo`: `bfs`, `dijkstra`, `astar`;
`nav`: `corta`, `terreno`; `debug=0` oculta la depuración).

## Qué se puede observar

- **Búsqueda** (Espacio): con T activado se ve la mancha de nodos explorados. BFS y Dijkstra
  exploran en todas direcciones; A* se orienta hacia la meta con la heurística Manhattan.
  BFS minimiza pasos y no ve costos; Dijkstra y A* minimizan costo.
- **Navegación** (N): el barro (marrón) es transitable pero cuesta 5 y frena al guardia al 40 %.
  Con *ruta corta* el guardia lo cruza; con *ruta por terreno* lo rodea si conviene.
  Con BFS la ruta por terreno no tiene efecto (el HUD lo avisa).
- **Comportamiento**: el color del guardia y de su cono indica el estado de la FSM; el HUD
  muestra la última transición. Las transiciones y las rutas se registran en la consola del
  navegador (F12) con el prefijo `[telemetria]`.
- **Escenarios** (G): cambian muros, barro, llave, salida, posiciones iniciales y puntos de
  patrulla; la patrulla recalcula sus rutas en cada mapa.

## Arquitectura

```
src/
├── domain/                 lógica pura, sin Phaser (probada con Vitest)
│   ├── model/              cuadrícula y vectores
│   ├── navigation/         BFS, Dijkstra, A* y seguimiento de ruta
│   ├── perception/         visión con oclusión, sonido y memoria
│   ├── behavior/           FSM del guardia
│   └── level/              generador procedural con semilla y validación
├── application/            agente guardia (coordina capas) y alternativas de navegación
└── game/                   escena Phaser: dibujo, entrada y HUD
specs/                      especificaciones usadas para desarrollar cada funcionalidad
tests/                      pruebas automatizadas
```

Flujo de capas del guardia: percepción → memoria → decisión (FSM) → búsqueda → seguimiento →
movimiento. La ruta se recalcula sólo ante un cambio relevante (nuevo destino, cambio de
algoritmo o de navegación, nuevo mapa), no en cada cuadro.

## Desarrollo

Se siguió un proceso spec-driven: GDD → specs (`specs/01` a `specs/05`) → implementación de a
una funcionalidad → pruebas automatizadas y prueba jugando. Se usó un agente de IA (Claude) como
asistente de desarrollo para explorar, implementar y revisar; las decisiones de diseño y la
revisión de lo generado son propias. La base de cuadrícula, percepción y seguimiento de ruta se
reutilizó del laboratorio *Guardia de Sigilo* trabajado en clase.
