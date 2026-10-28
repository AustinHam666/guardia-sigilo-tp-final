import { describe, expect, it } from "vitest";
import { cellKey, createGridMap, isWalkable, type GridPoint } from "../../src/domain/model/grid";
import { findPath, pathCost, SEARCH_ALGORITHMS, type EnterCostFn } from "../../src/domain/navigation/search";

const S: GridPoint = { x: 0, y: 1 };
const G: GridPoint = { x: 4, y: 1 };
const FREE = createGridMap(5, 3, []);
const MUD = new Set(["1,1", "2,1", "3,1"]);
const mudCost: EnterCostFn = (p) => (MUD.has(cellKey(p)) ? 5 : 1);

function cardinal(path: readonly GridPoint[]): boolean {
  return path.slice(1).every((p, i) => Math.abs(p.x - path[i]!.x) + Math.abs(p.y - path[i]!.y) === 1);
}

describe.each(SEARCH_ALGORITHMS)("%s", (algorithm) => {
  it("mapa libre: 4 pasos y costo 4", () => {
    const r = findPath(algorithm, FREE, S, G);
    expect(r.status).toBe("exito");
    expect(r.steps).toBe(4);
    expect(r.cost).toBe(4);
    expect(cardinal(r.path)).toBe(true);
    expect(r.path.every((p) => isWalkable(FREE, p))).toBe(true);
  });

  it("inicio = meta es éxito con costo 0", () => {
    const r = findPath(algorithm, FREE, S, S, mudCost);
    expect(r.status).toBe("exito");
    expect(r.path).toEqual([S]);
    expect(r.cost).toBe(0);
  });

  it("barrera completa es inaccesible", () => {
    const wall = createGridMap(5, 3, [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }]);
    const r = findPath(algorithm, wall, S, G);
    expect(r.status).toBe("inaccesible");
    expect(r.path).toEqual([]);
    expect(r.cost).toBeNull();
  });

  it("extremos inválidos se distinguen de inaccesible", () => {
    expect(findPath(algorithm, FREE, { x: -1, y: 1 }, G).status).toBe("inicio-invalido");
    expect(findPath(algorithm, FREE, S, { x: 5, y: 1 }).status).toBe("meta-invalida");
  });
});

describe("costos de terreno", () => {
  it("BFS ignora el barro: ruta directa de 4 pasos con costo real 16", () => {
    const r = findPath("bfs", FREE, S, G, mudCost);
    expect(r.steps).toBe(4);
    expect(r.cost).toBe(16);
  });

  it.each(["dijkstra", "astar"] as const)("%s rodea el barro: 6 pasos, costo 6", (algorithm) => {
    const r = findPath(algorithm, FREE, S, G, mudCost);
    expect(r.steps).toBe(6);
    expect(r.cost).toBe(6);
    expect(pathCost(r.path, mudCost)).toBe(6);
    expect(r.path.some((p) => MUD.has(cellKey(p)))).toBe(false);
  });

  it("A* encuentra el mismo costo que Dijkstra expandiendo igual o menos nodos", () => {
    const big = createGridMap(20, 12, [{ x: 10, y: 2 }, { x: 10, y: 3 }, { x: 10, y: 4 }, { x: 10, y: 5 }]);
    const d = findPath("dijkstra", big, { x: 1, y: 3 }, { x: 18, y: 4 }, mudCost);
    const a = findPath("astar", big, { x: 1, y: 3 }, { x: 18, y: 4 }, mudCost);
    expect(a.cost).toBe(d.cost);
    expect(a.expandedNodes).toBeLessThanOrEqual(d.expandedNodes);
  });

  it("rechaza costos menores que 1", () => {
    expect(() => findPath("astar", FREE, S, G, () => 0.5)).toThrow();
  });
});
