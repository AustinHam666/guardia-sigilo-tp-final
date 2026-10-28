import type { GridPoint } from "../model/grid";
import { manhattanDistance } from "../navigation/gridGraph";

export type GuardState = "patrullar" | "investigar" | "perseguir" | "buscar" | "regresar";

export const SEARCH_DURATION_MS = 3000;

export interface GuardContext {
  readonly state: GuardState;
  /** Índice del punto de patrulla al que se dirige (patrullar/regresar). */
  readonly patrolIndex: number;
  /** Destino de investigar/perseguir. */
  readonly target: GridPoint | null;
  readonly searchUntilMs: number;
  /** Puntos de patrulla inaccesibles seguidos; si llega a la cantidad total, espera. */
  readonly failedPatrolPoints: number;
}

export interface GuardPerception {
  readonly timeMs: number;
  readonly guardCell: GridPoint;
  /** Celda del jugador sólo si la visión es válida en este cuadro. */
  readonly seenPlayer: GridPoint | null;
  /** Origen de un ruido oído en este cuadro. */
  readonly heardNoise: GridPoint | null;
  /** Última posición conocida (memoria). */
  readonly lastKnown: GridPoint | null;
  /** El guardia llegó al final de la ruta hacia su destino actual. */
  readonly arrived: boolean;
  /** La última búsqueda hacia el destino actual fue inaccesible. */
  readonly unreachable: boolean;
}

export interface GuardStep {
  readonly context: GuardContext;
  /** Celda a la que el guardia debe ir ahora (null = quedarse quieto). */
  readonly goal: GridPoint | null;
  readonly transition: string | null;
}

export function initialGuardContext(): GuardContext {
  return { state: "patrullar", patrolIndex: 0, target: null, searchUntilMs: 0, failedPatrolPoints: 0 };
}

function same(a: GridPoint | null, b: GridPoint | null): boolean {
  return a !== null && b !== null && a.x === b.x && a.y === b.y;
}

function nearestPatrolIndex(from: GridPoint, patrol: readonly GridPoint[]): number {
  let best = 0;
  patrol.forEach((point, index) => {
    if (manhattanDistance(from, point) < manhattanDistance(from, patrol[best]!)) {
      best = index;
    }
  });
  return best;
}

export function goalFor(context: GuardContext, patrol: readonly GridPoint[]): GridPoint | null {
  switch (context.state) {
    case "patrullar":
    case "regresar":
      return context.failedPatrolPoints >= patrol.length ? null : patrol[context.patrolIndex] ?? null;
    case "investigar":
    case "perseguir":
      return context.target;
    case "buscar":
      return null;
  }
}

/**
 * Un paso de la FSM. Prioridad explícita: visión > inaccesible > sonido > llegada/tiempo.
 */
export function stepGuard(
  context: GuardContext,
  input: GuardPerception,
  patrol: readonly GridPoint[],
): GuardStep {
  const go = (next: GuardContext, transition: string | null): GuardStep => ({
    context: next,
    goal: goalFor(next, patrol),
    transition,
  });
  const from = context.state;

  // 1. Visión: cualquier estado -> perseguir (sin reiniciar si ya persigue).
  if (input.seenPlayer) {
    if (from === "perseguir") {
      return go({ ...context, target: input.seenPlayer }, null);
    }
    return go(
      { ...context, state: "perseguir", target: input.seenPlayer, failedPatrolPoints: 0 },
      `${from} -> perseguir (ve al jugador)`,
    );
  }

  // 2. Perder la visión mientras persigue -> investigar la última posición conocida.
  if (from === "perseguir") {
    const target = input.lastKnown ?? context.target;
    return go({ ...context, state: "investigar", target }, "perseguir -> investigar (pierde la visión)");
  }

  // 3. Destino inaccesible.
  if (input.unreachable) {
    if (from === "investigar") {
      const patrolIndex = nearestPatrolIndex(input.guardCell, patrol);
      return go(
        { ...context, state: "regresar", target: null, patrolIndex },
        "investigar -> regresar (destino inaccesible)",
      );
    }
    if (from === "patrullar" || from === "regresar") {
      const failed = context.failedPatrolPoints + 1;
      const patrolIndex = (context.patrolIndex + 1) % patrol.length;
      const next = { ...context, state: "patrullar" as const, patrolIndex, failedPatrolPoints: failed };
      return go(
        next,
        failed >= patrol.length
          ? `${from} -> patrullar (ningún punto alcanzable: espera)`
          : `${from} -> patrullar (punto inaccesible, salta al ${patrolIndex})`,
      );
    }
  }

  // 4. Sonido (sin visión): investigar el origen.
  if (input.heardNoise) {
    if (from === "investigar" && same(context.target, input.heardNoise)) {
      return go(context, null);
    }
    return go(
      { ...context, state: "investigar", target: input.heardNoise },
      from === "investigar" ? "investigar -> investigar (nuevo ruido)" : `${from} -> investigar (oye un ruido)`,
    );
  }

  // 5. Llegadas y tiempo.
  switch (from) {
    case "investigar":
      if (input.arrived) {
        return go(
          { ...context, state: "buscar", searchUntilMs: input.timeMs + SEARCH_DURATION_MS },
          "investigar -> buscar (llega al destino)",
        );
      }
      break;
    case "buscar":
      if (input.timeMs >= context.searchUntilMs) {
        const patrolIndex = nearestPatrolIndex(input.guardCell, patrol);
        return go(
          { ...context, state: "regresar", target: null, patrolIndex },
          "buscar -> regresar (tiempo agotado)",
        );
      }
      break;
    case "regresar":
      if (input.arrived) {
        const patrolIndex = (context.patrolIndex + 1) % patrol.length;
        return go(
          { ...context, state: "patrullar", patrolIndex, failedPatrolPoints: 0 },
          "regresar -> patrullar (llega al punto)",
        );
      }
      break;
    case "patrullar":
      if (input.arrived) {
        const patrolIndex = (context.patrolIndex + 1) % patrol.length;
        return go(
          { ...context, patrolIndex, failedPatrolPoints: 0 },
          `patrullar: punto ${context.patrolIndex} -> ${patrolIndex}`,
        );
      }
      break;
  }
  return go(context, null);
}
