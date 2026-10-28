import { TILE_SIZE } from "../../application/guardAgent";
import {
  cellCenter as domainCellCenter,
  worldToCell as domainWorldToCell,
  type GridPoint,
} from "../../domain/model/grid";
import type { Vector2 } from "../../domain/model/vector";

export { cellKey, isWalkable } from "../../domain/model/grid";

export function cellCenter(point: GridPoint): Vector2 {
  return domainCellCenter(point, TILE_SIZE);
}

export function worldToCell(point: Vector2): GridPoint {
  return domainWorldToCell(point, TILE_SIZE);
}

export function samePointCell(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
