import { cellKey } from "../domain/model/grid";
import { MUD_COST, type Level } from "../domain/level/level";
import { unitCost, type EnterCostFn, type SearchAlgorithm } from "../domain/navigation/search";

export type NavigationMode = "corta" | "terreno";
export const NAVIGATION_MODES: readonly NavigationMode[] = ["corta", "terreno"];

export const NAVIGATION_LABELS: Readonly<Record<NavigationMode, string>> = {
  corta: "RUTA CORTA",
  terreno: "RUTA POR TERRENO",
};

export const ALGORITHM_LABELS: Readonly<Record<SearchAlgorithm, string>> = {
  bfs: "BFS",
  dijkstra: "DIJKSTRA",
  astar: "A*",
};

/** Ruta corta: todo cuesta 1. Ruta por terreno: el barro cuesta MUD_COST. */
export function costFor(mode: NavigationMode, level: Pick<Level, "mud">): EnterCostFn {
  if (mode === "corta") {
    return unitCost;
  }
  return (point) => (level.mud.has(cellKey(point)) ? MUD_COST : 1);
}

/** Costo real del terreno (para informar en el HUD sin importar la alternativa). */
export function terrainCost(level: Pick<Level, "mud">): EnterCostFn {
  return costFor("terreno", level);
}

export function supportsCosts(algorithm: SearchAlgorithm): boolean {
  return algorithm !== "bfs";
}
