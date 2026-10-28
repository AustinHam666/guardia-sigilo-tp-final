import {
  goalFor,
  initialGuardContext,
  stepGuard,
  type GuardContext,
  type GuardState,
} from "../domain/behavior/guardFsm";
import { isMud, type Level } from "../domain/level/level";
import { cellCenter, worldToCell, type GridPoint } from "../domain/model/grid";
import type { Vector2 } from "../domain/model/vector";
import { advanceAlongPath } from "../domain/navigation/pathFollower";
import { findPath, samePoint, type SearchAlgorithm, type SearchResult } from "../domain/navigation/search";
import { emptyPerceptionMemory, rememberObservation, type PerceptionMemory } from "../domain/perception/memory";
import { evaluateSound, evaluateVision, type SoundEvent, type VisionResult } from "../domain/perception/perception";
import { costFor, terrainCost, type NavigationMode } from "./navigationModes";

export const TILE_SIZE = 32;
export const VISION_RANGE_CELLS = 7;
export const FIELD_OF_VIEW = Math.PI / 2;
export const GUARD_SPEED = 3.4 * TILE_SIZE;
export const CHASE_MULTIPLIER = 1.3;
export const MUD_SPEED_FACTOR = 0.4;
export const CATCH_DISTANCE = 0.6 * TILE_SIZE;

export interface AgentSettings {
  readonly algorithm: SearchAlgorithm;
  readonly navigation: NavigationMode;
}

export interface AgentInput {
  readonly timeMs: number;
  readonly deltaMs: number;
  readonly player: Vector2;
  readonly noise: SoundEvent | null;
}

export interface AgentFrame {
  readonly vision: VisionResult;
  readonly heard: boolean;
  readonly transition: string | null;
}

export type Telemetry = (message: string) => void;

/**
 * Coordina las capas del guardia: percepción → memoria → decisión (FSM) →
 * búsqueda → seguimiento → movimiento. No depende de Phaser.
 */
export class GuardAgent {
  public position: Vector2;
  public facing: Vector2 = { x: -1, y: 0 };
  public context: GuardContext = initialGuardContext();
  public memory: PerceptionMemory = emptyPerceptionMemory();
  public route: SearchResult | null = null;
  public currentGoal: GridPoint | null = null;
  public searchCount = 0;
  public lastTransition = "inicio: patrullar";
  public lastRouteCost: number | null = null;
  private waypoints: Vector2[] = [];
  private nextWaypoint = 0;
  private unreachable = false;
  private dirty = true;

  public constructor(
    private readonly level: Level,
    private settings: AgentSettings,
    private readonly telemetry: Telemetry = () => undefined,
  ) {
    this.position = cellCenter(level.guard, TILE_SIZE);
  }

  public get state(): GuardState {
    return this.context.state;
  }

  public get cell(): GridPoint {
    return worldToCell(this.position, TILE_SIZE);
  }

  public setSettings(settings: AgentSettings): void {
    if (settings.algorithm !== this.settings.algorithm || settings.navigation !== this.settings.navigation) {
      this.settings = settings;
      this.dirty = true;
      this.telemetry(`configuracion: ${settings.algorithm} / ${settings.navigation} -> recalcular ruta`);
    }
  }

  public update(input: AgentInput): AgentFrame {
    const vision = evaluateVision({
      map: this.level.map,
      tileSize: TILE_SIZE,
      observer: this.position,
      facing: this.facing,
      target: input.player,
      range: VISION_RANGE_CELLS * TILE_SIZE,
      fieldOfViewRadians: FIELD_OF_VIEW,
    });
    let heard = false;
    if (input.noise) {
      heard = evaluateSound(this.position, input.noise, input.timeMs).heard;
      if (heard) {
        this.memory = rememberObservation(this.memory, {
          source: "sound", position: input.noise.position, observedAtMs: input.timeMs,
        });
      }
    }
    if (vision.visible) {
      this.memory = rememberObservation(this.memory, {
        source: "vision", position: input.player, observedAtMs: input.timeMs,
      });
    }

    const toCell = (p: Vector2 | null): GridPoint | null => (p ? worldToCell(p, TILE_SIZE) : null);
    const routeDone = this.route?.status === "exito" && this.nextWaypoint >= this.waypoints.length;
    const arrived = this.currentGoal !== null && routeDone && samePoint(this.cell, this.currentGoal);

    const step = stepGuard(this.context, {
      timeMs: input.timeMs,
      guardCell: this.cell,
      seenPlayer: vision.visible ? toCell(input.player) : null,
      heardNoise: heard && !vision.visible && input.noise ? toCell(input.noise.position) : null,
      lastKnown: toCell(this.memory.lastKnownPosition),
      arrived,
      unreachable: this.unreachable,
    }, this.level.patrol);
    this.context = step.context;
    if (step.transition) {
      this.lastTransition = step.transition;
      this.telemetry(`t=${Math.round(input.timeMs)}ms FSM ${step.transition}`);
    }

    this.updateRoute(step.goal);
    this.move(input);
    return { vision, heard, transition: step.transition };
  }

  /** Recalcula sólo ante un cambio relevante: destino nuevo o configuración nueva. */
  private updateRoute(goal: GridPoint | null): void {
    const goalChanged = (goal === null) !== (this.currentGoal === null)
      || (goal !== null && this.currentGoal !== null && !samePoint(goal, this.currentGoal));
    if (!goalChanged && !this.dirty) {
      return;
    }
    this.dirty = false;
    this.currentGoal = goal;
    this.unreachable = false;
    if (goal === null) {
      this.waypoints = [];
      this.nextWaypoint = 0;
      return;
    }
    const result = findPath(
      this.settings.algorithm,
      this.level.map,
      this.cell,
      goal,
      costFor(this.settings.navigation, this.level),
    );
    this.searchCount += 1;
    this.route = result;
    if (result.status === "exito") {
      const terrain = terrainCost(this.level);
      this.lastRouteCost = result.path.slice(1).reduce((sum, p) => sum + terrain(p), 0);
      this.waypoints = result.path.map((p) => cellCenter(p, TILE_SIZE));
      this.nextWaypoint = 0;
      this.telemetry(
        `ruta ${this.settings.algorithm}/${this.settings.navigation} -> (${goal.x},${goal.y}): `
        + `${result.steps} pasos, costo terreno ${this.lastRouteCost}, expandidos ${result.expandedNodes}`,
      );
    } else {
      this.unreachable = true;
      this.waypoints = [];
      this.nextWaypoint = 0;
      this.lastRouteCost = null;
      this.telemetry(`ruta -> (${goal.x},${goal.y}): ${result.status.toUpperCase()}`);
    }
  }

  private move(input: AgentInput): void {
    if (this.context.state === "buscar") {
      const angle = Math.atan2(this.facing.y, this.facing.x) + (Math.PI * input.deltaMs) / 1000;
      this.facing = { x: Math.cos(angle), y: Math.sin(angle) };
      return;
    }
    if (this.waypoints.length === 0) {
      return;
    }
    let speed = GUARD_SPEED;
    if (this.context.state === "perseguir") speed *= CHASE_MULTIPLIER;
    if (isMud(this.level, this.cell)) speed *= MUD_SPEED_FACTOR;
    const movement = advanceAlongPath(this.position, this.waypoints, this.nextWaypoint, (speed * input.deltaMs) / 1000);
    this.position = movement.position;
    this.nextWaypoint = movement.nextWaypoint;
    if (movement.direction) {
      this.facing = movement.direction;
    }
  }

  public catches(player: Vector2): boolean {
    return Math.hypot(player.x - this.position.x, player.y - this.position.y) < CATCH_DISTANCE;
  }

  public patrolGoal(): GridPoint | null {
    return goalFor(this.context, this.level.patrol);
  }
}
