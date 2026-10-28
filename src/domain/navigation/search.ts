import { cellKey, isWalkable, type GridMap, type GridPoint } from "../model/grid";
import { manhattanDistance, walkableNeighbors } from "./gridGraph";

export type SearchAlgorithm = "bfs" | "dijkstra" | "astar";
export type SearchStatus = "exito" | "inaccesible" | "inicio-invalido" | "meta-invalida";

/** Costo de ENTRAR en una celda. Debe ser finito y >= 1. */
export type EnterCostFn = (point: GridPoint) => number;

export const SEARCH_ALGORITHMS: readonly SearchAlgorithm[] = ["bfs", "dijkstra", "astar"];

export interface SearchResult {
  readonly algorithm: SearchAlgorithm;
  readonly status: SearchStatus;
  readonly path: readonly GridPoint[];
  /** Cantidad de aristas de la ruta (no de puntos). */
  readonly steps: number | null;
  /** Suma real de costos de entrada de la ruta, para todos los algoritmos. */
  readonly cost: number | null;
  readonly expandedNodes: number;
  readonly maximumFrontier: number;
  readonly explored: readonly GridPoint[];
}

export const unitCost: EnterCostFn = () => 1;

export function findPath(
  algorithm: SearchAlgorithm,
  map: GridMap,
  start: GridPoint,
  goal: GridPoint,
  enterCost: EnterCostFn = unitCost,
): SearchResult {
  if (!isWalkable(map, start)) {
    return failure(algorithm, "inicio-invalido", [], 0);
  }
  if (!isWalkable(map, goal)) {
    return failure(algorithm, "meta-invalida", [], 0);
  }
  return algorithm === "bfs"
    ? breadthFirst(map, start, goal, enterCost)
    : bestFirst(algorithm, map, start, goal, enterCost);
}

function breadthFirst(
  map: GridMap,
  start: GridPoint,
  goal: GridPoint,
  enterCost: EnterCostFn,
): SearchResult {
  const frontier: GridPoint[] = [start];
  let head = 0;
  let maximumFrontier = 1;
  const visited = new Set([cellKey(start)]);
  const parents = new Map<string, GridPoint>();
  const explored: GridPoint[] = [];

  while (head < frontier.length) {
    const current = frontier[head]!;
    head += 1;
    explored.push(current);
    if (samePoint(current, goal)) {
      return success("bfs", reconstruct(start, goal, parents), enterCost, explored, maximumFrontier);
    }
    for (const neighbor of walkableNeighbors(map, current)) {
      const key = cellKey(neighbor);
      if (!visited.has(key)) {
        visited.add(key);
        parents.set(key, current);
        frontier.push(neighbor);
      }
    }
    maximumFrontier = Math.max(maximumFrontier, frontier.length - head);
  }
  return failure("bfs", "inaccesible", explored, maximumFrontier);
}

interface FrontierEntry {
  readonly point: GridPoint;
  readonly g: number;
  readonly h: number;
  readonly order: number;
}

/** Dijkstra (h = 0) y A* (h = Manhattan) comparten la misma búsqueda por prioridad. */
function bestFirst(
  algorithm: "dijkstra" | "astar",
  map: GridMap,
  start: GridPoint,
  goal: GridPoint,
  enterCost: EnterCostFn,
): SearchResult {
  const heuristic = (point: GridPoint): number =>
    algorithm === "astar" ? manhattanDistance(point, goal) : 0;
  let order = 0;
  const frontier = new Map<string, FrontierEntry>([
    [cellKey(start), { point: start, g: 0, h: heuristic(start), order }],
  ]);
  const best = new Map<string, number>([[cellKey(start), 0]]);
  const parents = new Map<string, GridPoint>();
  const closed = new Set<string>();
  const explored: GridPoint[] = [];
  let maximumFrontier = 1;

  while (frontier.size > 0) {
    const current = pickLowest(frontier);
    const currentKey = cellKey(current.point);
    frontier.delete(currentKey);
    closed.add(currentKey);
    explored.push(current.point);

    if (samePoint(current.point, goal)) {
      return success(algorithm, reconstruct(start, goal, parents), enterCost, explored, maximumFrontier);
    }

    for (const neighbor of walkableNeighbors(map, current.point)) {
      const key = cellKey(neighbor);
      if (closed.has(key)) {
        continue;
      }
      const step = enterCost(neighbor);
      assertValidCost(step);
      const candidate = current.g + step;
      const known = best.get(key);
      if (known === undefined || candidate < known) {
        order += 1;
        best.set(key, candidate);
        parents.set(key, current.point);
        frontier.set(key, { point: neighbor, g: candidate, h: heuristic(neighbor), order });
      }
    }
    maximumFrontier = Math.max(maximumFrontier, frontier.size);
  }
  return failure(algorithm, "inaccesible", explored, maximumFrontier);
}

/** Menor f = g + h; desempate: menor h, luego orden de inserción. */
function pickLowest(frontier: ReadonlyMap<string, FrontierEntry>): FrontierEntry {
  let selected: FrontierEntry | undefined;
  for (const entry of frontier.values()) {
    if (!selected) {
      selected = entry;
      continue;
    }
    const f = entry.g + entry.h;
    const selectedF = selected.g + selected.h;
    if (
      f < selectedF
      || (f === selectedF && entry.h < selected.h)
      || (f === selectedF && entry.h === selected.h && entry.order < selected.order)
    ) {
      selected = entry;
    }
  }
  if (!selected) {
    throw new Error("Frontier invariant failed.");
  }
  return selected;
}

export function assertValidCost(cost: number): void {
  if (!Number.isFinite(cost) || cost < 1) {
    throw new Error("Enter cost must be finite and >= 1.");
  }
}

export function pathCost(path: readonly GridPoint[], enterCost: EnterCostFn): number {
  return path.slice(1).reduce((sum, point) => sum + enterCost(point), 0);
}

function success(
  algorithm: SearchAlgorithm,
  path: readonly GridPoint[],
  enterCost: EnterCostFn,
  explored: readonly GridPoint[],
  maximumFrontier: number,
): SearchResult {
  return {
    algorithm,
    status: "exito",
    path,
    steps: path.length - 1,
    cost: pathCost(path, enterCost),
    expandedNodes: explored.length,
    maximumFrontier,
    explored,
  };
}

function failure(
  algorithm: SearchAlgorithm,
  status: Exclude<SearchStatus, "exito">,
  explored: readonly GridPoint[],
  maximumFrontier: number,
): SearchResult {
  return {
    algorithm,
    status,
    path: [],
    steps: null,
    cost: null,
    expandedNodes: explored.length,
    maximumFrontier,
    explored,
  };
}

function reconstruct(
  start: GridPoint,
  goal: GridPoint,
  parents: ReadonlyMap<string, GridPoint>,
): GridPoint[] {
  const path: GridPoint[] = [goal];
  let current = goal;
  while (!samePoint(current, start)) {
    const parent = parents.get(cellKey(current));
    if (!parent) {
      throw new Error("Path reconstruction invariant failed.");
    }
    path.push(parent);
    current = parent;
  }
  return path.reverse();
}

export function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
