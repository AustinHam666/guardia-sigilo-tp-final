import { cellKey, createGridMap, isWalkable, type GridMap, type GridPoint } from "../model/grid";
import { findPath } from "../navigation/search";
import { manhattanDistance } from "../navigation/gridGraph";
import { createRandom, type Random } from "./random";

export const LEVEL_WIDTH = 30;
export const LEVEL_HEIGHT = 20;
export const MUD_COST = 5;
export const MAX_ATTEMPTS = 50;

export interface Level {
  readonly map: GridMap;
  readonly mud: ReadonlySet<string>;
  readonly player: GridPoint;
  readonly guard: GridPoint;
  readonly key: GridPoint;
  readonly exit: GridPoint;
  readonly patrol: readonly GridPoint[];
  readonly seed: number;
  readonly attempts: number;
  readonly fallback: boolean;
}

export interface LevelProblem {
  readonly rule: string;
}

const MIN_GUARD_PLAYER = 12;
const MIN_KEY_PLAYER = 8;
const MIN_EXIT_KEY = 8;
const MIN_PATROL_GAP = 6;

export function isMud(level: Pick<Level, "mud">, point: GridPoint): boolean {
  return level.mud.has(cellKey(point));
}

export function generateLevel(seed: number): Level {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const random = createRandom(seed * 1000 + attempt);
    const candidate = buildCandidate(random, seed, attempt);
    if (candidate && validateLevel(candidate).length === 0) {
      return candidate;
    }
  }
  return { ...fallbackLevel(), seed, attempts: MAX_ATTEMPTS, fallback: true };
}

/** Devuelve la lista de reglas incumplidas (vacía si el nivel es válido). */
export function validateLevel(level: Level): LevelProblem[] {
  const problems: LevelProblem[] = [];
  const { map } = level;
  const entities = [level.player, level.guard, level.key, level.exit, ...level.patrol];

  if (!entities.every((p) => isWalkable(map, p))) {
    problems.push({ rule: "entidades en celdas transitables" });
  }
  if (new Set(entities.map(cellKey)).size !== entities.length) {
    problems.push({ rule: "entidades sin superponerse" });
  }
  if (level.patrol.length < 3) {
    problems.push({ rule: "al menos 3 puntos de patrulla" });
  }
  const reachable = (from: GridPoint, to: GridPoint): boolean =>
    findPath("bfs", map, from, to).status === "exito";
  if (!reachable(level.player, level.key)) {
    problems.push({ rule: "camino jugador -> llave" });
  }
  if (!reachable(level.key, level.exit)) {
    problems.push({ rule: "camino llave -> salida" });
  }
  const firstPatrol = level.patrol[0];
  if (firstPatrol && !reachable(level.guard, firstPatrol)) {
    problems.push({ rule: "camino guardia -> patrulla" });
  }
  level.patrol.forEach((from, index) => {
    const to = level.patrol[(index + 1) % level.patrol.length]!;
    if (!reachable(from, to)) {
      problems.push({ rule: `camino patrulla ${index} -> ${(index + 1) % level.patrol.length}` });
    }
  });
  return problems;
}

function buildCandidate(random: Random, seed: number, attempts: number): Level | null {
  const blocked = new Set<string>();
  const block = (x: number, y: number): void => {
    blocked.add(cellKey({ x, y }));
  };
  for (let x = 0; x < LEVEL_WIDTH; x += 1) {
    block(x, 0);
    block(x, LEVEL_HEIGHT - 1);
  }
  for (let y = 0; y < LEVEL_HEIGHT; y += 1) {
    block(0, y);
    block(LEVEL_WIDTH - 1, y);
  }

  const wallCount = random.int(14, 20);
  for (let i = 0; i < wallCount; i += 1) {
    const horizontal = random.next() < 0.5;
    const length = random.int(3, 8);
    const thickness = random.int(1, 2);
    const width = horizontal ? length : thickness;
    const height = horizontal ? thickness : length;
    const x0 = random.int(2, LEVEL_WIDTH - 2 - width);
    const y0 = random.int(2, LEVEL_HEIGHT - 2 - height);
    for (let y = y0; y < y0 + height; y += 1) {
      for (let x = x0; x < x0 + width; x += 1) {
        block(x, y);
      }
    }
  }

  const map = createGridMap(
    LEVEL_WIDTH,
    LEVEL_HEIGHT,
    [...blocked].map((key) => {
      const [x, y] = key.split(",").map(Number);
      return { x: x!, y: y! };
    }),
  );

  const mud = new Set<string>();
  const mudCount = random.int(3, 5);
  for (let i = 0; i < mudCount; i += 1) {
    const width = random.int(2, 5);
    const height = random.int(2, 4);
    const x0 = random.int(1, LEVEL_WIDTH - 1 - width);
    const y0 = random.int(1, LEVEL_HEIGHT - 1 - height);
    for (let y = y0; y < y0 + height; y += 1) {
      for (let x = x0; x < x0 + width; x += 1) {
        if (isWalkable(map, { x, y })) {
          mud.add(cellKey({ x, y }));
        }
      }
    }
  }

  // Personajes y objetivos fuera del barro para que el inicio sea claro.
  const free: GridPoint[] = [];
  for (let y = 1; y < LEVEL_HEIGHT - 1; y += 1) {
    for (let x = 1; x < LEVEL_WIDTH - 1; x += 1) {
      if (isWalkable(map, { x, y }) && !mud.has(cellKey({ x, y }))) {
        free.push({ x, y });
      }
    }
  }
  const used = new Set<string>();
  const place = (accept: (p: GridPoint) => boolean): GridPoint | null => {
    for (let tries = 0; tries < 200; tries += 1) {
      const point = random.pick(free);
      if (!used.has(cellKey(point)) && accept(point)) {
        used.add(cellKey(point));
        return point;
      }
    }
    return null;
  };

  const player = place(() => true);
  if (!player) return null;
  const guard = place((p) => manhattanDistance(p, player) >= MIN_GUARD_PLAYER);
  if (!guard) return null;
  const key = place((p) => manhattanDistance(p, player) >= MIN_KEY_PLAYER);
  if (!key) return null;
  const exit = place((p) => manhattanDistance(p, key) >= MIN_EXIT_KEY);
  if (!exit) return null;

  const patrol: GridPoint[] = [];
  const patrolCount = random.int(3, 4);
  for (let i = 0; i < patrolCount; i += 1) {
    const point = place((p) => patrol.every((q) => manhattanDistance(p, q) >= MIN_PATROL_GAP)
      && manhattanDistance(p, player) >= 6);
    if (!point) return null;
    patrol.push(point);
  }

  return { map, mud, player, guard, key, exit, patrol, seed, attempts, fallback: false };
}

/** Mapa base conocido y válido, usado sólo si fallan todos los intentos. */
export function fallbackLevel(): Level {
  const blocked: GridPoint[] = [];
  for (let x = 0; x < LEVEL_WIDTH; x += 1) {
    blocked.push({ x, y: 0 }, { x, y: LEVEL_HEIGHT - 1 });
  }
  for (let y = 1; y < LEVEL_HEIGHT - 1; y += 1) {
    blocked.push({ x: 0, y }, { x: LEVEL_WIDTH - 1, y });
  }
  for (let y = 3; y < 15; y += 1) {
    blocked.push({ x: 10, y }, { x: 20, y });
  }
  const mud = new Set<string>();
  for (let y = 8; y < 12; y += 1) {
    for (let x = 13; x < 17; x += 1) {
      mud.add(cellKey({ x, y }));
    }
  }
  return {
    map: createGridMap(LEVEL_WIDTH, LEVEL_HEIGHT, blocked),
    mud,
    player: { x: 2, y: 2 },
    guard: { x: 26, y: 16 },
    key: { x: 15, y: 3 },
    exit: { x: 27, y: 2 },
    patrol: [{ x: 25, y: 16 }, { x: 15, y: 16 }, { x: 15, y: 5 }, { x: 25, y: 5 }],
    seed: 0,
    attempts: 0,
    fallback: true,
  };
}
