import { describe, expect, it } from "vitest";
import { GuardAgent, TILE_SIZE } from "../../src/application/guardAgent";
import { costFor } from "../../src/application/navigationModes";
import { generateLevel, type Level } from "../../src/domain/level/level";
import { cellCenter, cellKey, createGridMap, isWalkable, type GridPoint } from "../../src/domain/model/grid";
import { findPath } from "../../src/domain/navigation/search";

// Nivel de prueba 12x7: barro vertical en x=5..6, y=1..4 entre el guardia (1,2) y el punto (10,2).
function mudLevel(): Level {
  const blocked: GridPoint[] = [];
  for (let x = 0; x < 12; x += 1) blocked.push({ x, y: 0 }, { x, y: 6 });
  for (let y = 1; y < 6; y += 1) blocked.push({ x: 0, y }, { x: 11, y });
  const mud = new Set<string>();
  for (let y = 1; y <= 4; y += 1) for (let x = 5; x <= 6; x += 1) mud.add(cellKey({ x, y }));
  return {
    map: createGridMap(12, 7, blocked),
    mud,
    player: { x: 1, y: 5 },
    guard: { x: 1, y: 2 },
    key: { x: 3, y: 5 },
    exit: { x: 9, y: 5 },
    patrol: [{ x: 10, y: 2 }, { x: 10, y: 4 }, { x: 1, y: 4 }],
    seed: 0,
    attempts: 0,
    fallback: false,
  };
}

const FAR = { x: -1000, y: -1000 };
const tick = (agent: GuardAgent, timeMs: number, player = FAR) =>
  agent.update({ timeMs, deltaMs: 16, player, noise: null });

describe("alternativas de navegación (spec 03)", () => {
  it("ruta corta cruza el barro y ruta por terreno lo rodea", () => {
    const level = mudLevel();
    const short = new GuardAgent(level, { algorithm: "astar", navigation: "corta" });
    const terrain = new GuardAgent(level, { algorithm: "astar", navigation: "terreno" });
    tick(short, 0);
    tick(terrain, 0);
    const crosses = (agent: GuardAgent) => agent.route!.path.some((p) => level.mud.has(cellKey(p)));
    expect(crosses(short)).toBe(true);
    expect(crosses(terrain)).toBe(false);
    expect(short.route!.steps!).toBeLessThan(terrain.route!.steps!);
    expect(terrain.lastRouteCost!).toBeLessThan(short.lastRouteCost!);
  });

  it("con BFS la alternativa por terreno no tiene efecto (BFS ignora costos)", () => {
    const level = mudLevel();
    const bfs = new GuardAgent(level, { algorithm: "bfs", navigation: "terreno" });
    tick(bfs, 0);
    expect(bfs.route!.path.some((p) => level.mud.has(cellKey(p)))).toBe(true);
  });

  it("no recalcula sin cambios relevantes; cambiar la alternativa recalcula una vez", () => {
    const agent = new GuardAgent(mudLevel(), { algorithm: "astar", navigation: "corta" });
    tick(agent, 0);
    const after = agent.searchCount;
    for (let i = 1; i <= 10; i += 1) tick(agent, i * 16);
    expect(agent.searchCount).toBe(after);
    agent.setSettings({ algorithm: "astar", navigation: "terreno" });
    tick(agent, 200);
    expect(agent.searchCount).toBe(after + 1);
  });
});

describe("agente guardia (spec 04)", () => {
  it("patrulla: llega al punto 0 y sigue al punto 1", () => {
    const agent = new GuardAgent(mudLevel(), { algorithm: "astar", navigation: "terreno" });
    let t = 0;
    while (agent.context.patrolIndex === 0 && t < 20000) {
      t += 16;
      tick(agent, t);
    }
    expect(agent.context.patrolIndex).toBe(1);
    expect(agent.state).toBe("patrullar");
  });

  it("no ve al jugador a través de una pared", () => {
    const level = mudLevel();
    const walled: Level = {
      ...level,
      map: createGridMap(12, 7, [...[...level.map.blocked].map((k) => {
        const [x, y] = k.split(",").map(Number);
        return { x: x!, y: y! };
      }), { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }]),
    };
    const agent = new GuardAgent(walled, { algorithm: "astar", navigation: "corta" });
    agent.facing = { x: 1, y: 0 };
    const frame = agent.update({ timeMs: 0, deltaMs: 0, player: cellCenter({ x: 5, y: 2 }, TILE_SIZE), noise: null });
    expect(frame.vision.reason).toBe("occluded");
    expect(agent.state).toBe("patrullar");
  });

  it("ve al jugador en su cono y pasa a perseguir", () => {
    const agent = new GuardAgent(mudLevel(), { algorithm: "astar", navigation: "corta" });
    agent.facing = { x: 1, y: 0 };
    agent.update({ timeMs: 0, deltaMs: 0, player: cellCenter({ x: 4, y: 2 }, TILE_SIZE), noise: null });
    expect(agent.state).toBe("perseguir");
    expect(agent.currentGoal).toEqual({ x: 4, y: 2 });
  });

  it("caso límite: ruido en una zona aislada → inaccesible, regresa y no atraviesa paredes", () => {
    const level = mudLevel();
    const blocked = [...level.map.blocked].map((k) => {
      const [x, y] = k.split(",").map(Number);
      return { x: x!, y: y! };
    });
    // Encierra la celda (8,4).
    blocked.push({ x: 7, y: 4 }, { x: 9, y: 4 }, { x: 8, y: 3 }, { x: 8, y: 5 });
    const isolated: Level = { ...level, map: createGridMap(12, 7, blocked) };
    const agent = new GuardAgent(isolated, { algorithm: "astar", navigation: "corta" });
    tick(agent, 0);
    agent.update({
      timeMs: 16, deltaMs: 16, player: FAR,
      noise: { position: cellCenter({ x: 8, y: 4 }, TILE_SIZE), radius: 20 * TILE_SIZE, emittedAtMs: 16, durationMs: 600 },
    });
    expect(agent.route!.status).toBe("inaccesible");
    tick(agent, 32);
    expect(agent.state).toBe("regresar");
    for (let t = 48; t < 3000; t += 16) {
      tick(agent, t);
      expect(isWalkable(isolated.map, agent.cell)).toBe(true);
    }
  });

  it("la patrulla se adapta al escenario generado (varias semillas)", () => {
    for (const seed of [1, 2, 3, 10, 99]) {
      const level = generateLevel(seed);
      const agent = new GuardAgent(level, { algorithm: "astar", navigation: "terreno" });
      tick(agent, 0);
      expect(agent.route!.status).toBe("exito");
      expect(agent.route!.path.at(-1)).toEqual(level.patrol[0]);
      level.patrol.forEach((from, i) => {
        const to = level.patrol[(i + 1) % level.patrol.length]!;
        expect(findPath("dijkstra", level.map, from, to, costFor("terreno", level)).status).toBe("exito");
      });
    }
  });
});
