import { describe, expect, it } from "vitest";
import { cellKey, isWalkable } from "../../src/domain/model/grid";
import { manhattanDistance } from "../../src/domain/navigation/gridGraph";
import {
  fallbackLevel,
  generateLevel,
  LEVEL_HEIGHT,
  LEVEL_WIDTH,
  validateLevel,
} from "../../src/domain/level/level";

describe("generador de escenarios (spec 01)", () => {
  it("500 semillas producen mapas que cumplen todas las reglas", () => {
    let fallbacks = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const level = generateLevel(seed);
      expect(validateLevel(level), `semilla ${seed}`).toEqual([]);
      if (level.fallback) fallbacks += 1;
      expect(manhattanDistance(level.guard, level.player)).toBeGreaterThanOrEqual(12);
      expect(level.patrol.length).toBeGreaterThanOrEqual(3);
      expect(level.mud.size).toBeGreaterThan(0);
      for (const key of level.mud) {
        const [x, y] = key.split(",").map(Number);
        expect(isWalkable(level.map, { x: x!, y: y! })).toBe(true);
      }
    }
    expect(fallbacks).toBeLessThan(5);
  });

  it("el borde siempre es pared", () => {
    const level = generateLevel(42);
    for (let x = 0; x < LEVEL_WIDTH; x += 1) {
      expect(isWalkable(level.map, { x, y: 0 })).toBe(false);
      expect(isWalkable(level.map, { x, y: LEVEL_HEIGHT - 1 })).toBe(false);
    }
  });

  it("misma semilla → mismo mapa; semillas distintas → mapas distintos", () => {
    const a = generateLevel(7);
    const b = generateLevel(7);
    const c = generateLevel(8);
    expect([...a.map.blocked].sort()).toEqual([...b.map.blocked].sort());
    expect(a.patrol).toEqual(b.patrol);
    expect([...a.map.blocked].sort()).not.toEqual([...c.map.blocked].sort());
  });

  it("detecta un nivel inválido (llave encerrada)", () => {
    const base = fallbackLevel();
    const walls = [{ x: 14, y: 3 }, { x: 16, y: 3 }, { x: 15, y: 2 }, { x: 15, y: 4 }];
    const blocked = new Set(base.map.blocked);
    walls.forEach((w) => blocked.add(cellKey(w)));
    const broken = { ...base, map: { ...base.map, blocked } };
    expect(validateLevel(broken).map((p) => p.rule)).toContain("camino jugador -> llave");
  });

  it("el mapa base de respaldo es válido", () => {
    expect(validateLevel(fallbackLevel())).toEqual([]);
  });
});
