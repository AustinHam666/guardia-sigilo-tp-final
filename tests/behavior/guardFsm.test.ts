import { describe, expect, it } from "vitest";
import type { GridPoint } from "../../src/domain/model/grid";
import {
  initialGuardContext,
  SEARCH_DURATION_MS,
  stepGuard,
  type GuardContext,
  type GuardPerception,
} from "../../src/domain/behavior/guardFsm";

const PATROL: GridPoint[] = [{ x: 2, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 8 }];
const base: GuardPerception = {
  timeMs: 0,
  guardCell: { x: 2, y: 2 },
  seenPlayer: null,
  heardNoise: null,
  lastKnown: null,
  arrived: false,
  unreachable: false,
};
const step = (ctx: GuardContext, over: Partial<GuardPerception>) =>
  stepGuard(ctx, { ...base, ...over }, PATROL);

describe("FSM del guardia (spec 04)", () => {
  it("empieza patrullando hacia el punto 0 y avanza en ciclo al llegar", () => {
    let ctx = initialGuardContext();
    expect(step(ctx, {}).goal).toEqual(PATROL[0]);
    for (const expected of [1, 2, 0]) {
      ctx = step(ctx, { arrived: true }).context;
      expect(ctx.patrolIndex).toBe(expected);
      expect(ctx.state).toBe("patrullar");
    }
  });

  it("secuencia completa: patrullar → investigar → buscar → regresar → patrullar", () => {
    const noise = { x: 6, y: 5 };
    let s = step(initialGuardContext(), { heardNoise: noise });
    expect(s.context.state).toBe("investigar");
    expect(s.goal).toEqual(noise);
    s = step(s.context, { arrived: true, timeMs: 1000 });
    expect(s.context.state).toBe("buscar");
    expect(s.goal).toBeNull();
    s = step(s.context, { timeMs: 1000 + SEARCH_DURATION_MS - 1 });
    expect(s.context.state).toBe("buscar");
    s = step(s.context, { timeMs: 1000 + SEARCH_DURATION_MS, guardCell: { x: 9, y: 7 } });
    expect(s.context.state).toBe("regresar");
    expect(s.goal).toEqual({ x: 10, y: 8 });
    s = step(s.context, { arrived: true });
    expect(s.context.state).toBe("patrullar");
    expect(s.context.patrolIndex).toBe(0);
  });

  it("ver al jugador desde cualquier estado → perseguir, sin reiniciar si ya persigue", () => {
    const player = { x: 5, y: 5 };
    for (const state of ["patrullar", "investigar", "buscar", "regresar"] as const) {
      const s = step({ ...initialGuardContext(), state }, { seenPlayer: player });
      expect(s.context.state).toBe("perseguir");
      expect(s.transition).toContain("perseguir");
    }
    const chasing = step(initialGuardContext(), { seenPlayer: player }).context;
    const again = step(chasing, { seenPlayer: { x: 6, y: 5 } });
    expect(again.transition).toBeNull();
    expect(again.goal).toEqual({ x: 6, y: 5 });
  });

  it("al perder la visión investiga la última posición conocida", () => {
    const chasing = step(initialGuardContext(), { seenPlayer: { x: 5, y: 5 } }).context;
    const s = step(chasing, { lastKnown: { x: 7, y: 5 } });
    expect(s.context.state).toBe("investigar");
    expect(s.goal).toEqual({ x: 7, y: 5 });
  });

  it("visión tiene prioridad sobre sonido en el mismo cuadro", () => {
    const s = step(initialGuardContext(), { seenPlayer: { x: 5, y: 5 }, heardNoise: { x: 1, y: 1 } });
    expect(s.context.state).toBe("perseguir");
    expect(s.goal).toEqual({ x: 5, y: 5 });
  });

  it("caso límite: investigar un destino inaccesible → regresar sin trabarse", () => {
    const investigating = step(initialGuardContext(), { heardNoise: { x: 20, y: 20 } }).context;
    const s = step(investigating, { unreachable: true, guardCell: { x: 9, y: 2 } });
    expect(s.context.state).toBe("regresar");
    expect(s.goal).toEqual({ x: 10, y: 2 });
  });

  it("caso límite: si ningún punto de patrulla es alcanzable, espera quieto", () => {
    let ctx = initialGuardContext();
    for (let i = 0; i < PATROL.length; i += 1) {
      ctx = step(ctx, { unreachable: true }).context;
    }
    expect(step(ctx, {}).goal).toBeNull();
    // Un cambio relevante (ver al jugador) lo reactiva.
    expect(step(ctx, { seenPlayer: { x: 3, y: 3 } }).context.failedPatrolPoints).toBe(0);
  });

  it("un ruido repetido en el mismo lugar no genera transiciones nuevas", () => {
    const noise = { x: 6, y: 5 };
    const investigating = step(initialGuardContext(), { heardNoise: noise }).context;
    expect(step(investigating, { heardNoise: noise }).transition).toBeNull();
  });
});
