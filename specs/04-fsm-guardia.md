# Spec 04 — Percepción y comportamiento del guardia (FSM)

## Objetivo
El guardia patrulla, investiga ruidos, persigue al jugador cuando lo ve, lo
busca al perderlo y regresa a su patrulla, con decisiones observables.

## Percepción y memoria
- Visión: cono de 90°, alcance 7 celdas, bloqueada por paredes.
- Oído: el jugador puede hacer un ruido (Q) de radio 6 celdas durante 0,6 s.
- Visión tiene prioridad sobre sonido.
- Memoria: última posición conocida del jugador; sólo cambia ante percepción
  válida (nunca usa la posición real oculta).

## Estados y transiciones
| Origen        | Evento / guarda               | Destino    | Acción |
|---------------|-------------------------------|------------|--------|
| Cualquiera    | ve al jugador                 | Perseguir  | destino = celda del jugador |
| Perseguir     | pierde la visión              | Investigar | destino = última posición conocida |
| Patrullar, Regresar, Buscar, Investigar | oye un ruido (sin visión) | Investigar | destino = origen del ruido |
| Investigar    | llega al destino              | Buscar     | gira la mirada durante 3 s |
| Buscar        | pasan 3 s sin percepción      | Regresar   | destino = punto de patrulla más cercano |
| Regresar      | llega al punto                | Patrullar  | sigue el circuito desde ese punto |
| Patrullar     | llega al punto                | Patrullar  | siguiente punto del circuito |
| Perseguir / Investigar | destino inaccesible  | Regresar   | no avanza; registra "inaccesible" |
| Patrullar / Regresar | punto inaccesible      | Patrullar  | salta al siguiente punto; si ninguno es alcanzable, espera quieto |

- Sólo un estado activo. Cada transición queda registrada (telemetría en
  consola y último cambio en el HUD).
- Ver al jugador estando ya en Perseguir no reinicia el estado: sólo actualiza
  el destino si el jugador cambió de celda.

## Fuera de alcance
Varios guardias, combate, animaciones.

## Cómo comprobarlo
- Pruebas de la FSM: secuencia completa Patrullar → Investigar → Buscar →
  Regresar → Patrullar; Perseguir al ver; Investigar al perder la visión;
  prioridad de visión sobre sonido; casos inaccesibles.
- Jugando: el color del cono y el HUD muestran el estado; el guardia no ve a
  través de paredes; un ruido en zona aislada no lo traba (registra
  "inaccesible" y regresa).
