import Phaser from "phaser";
import { CATCH_DISTANCE, FIELD_OF_VIEW, GuardAgent, TILE_SIZE, VISION_RANGE_CELLS } from "../../application/guardAgent";
import {
  ALGORITHM_LABELS,
  NAVIGATION_LABELS,
  NAVIGATION_MODES,
  supportsCosts,
  type NavigationMode,
} from "../../application/navigationModes";
import type { GuardState } from "../../domain/behavior/guardFsm";
import { generateLevel, LEVEL_HEIGHT, LEVEL_WIDTH, type Level } from "../../domain/level/level";
import { cellCenter, isWalkable, samePointCell, worldToCell } from "../presentation/cells";
import { SEARCH_ALGORITHMS, type SearchAlgorithm } from "../../domain/navigation/search";
import type { SoundEvent } from "../../domain/perception/perception";

export const HUD_HEIGHT = 78;
const PLAYER_SPEED = 150;
const NOISE_RADIUS = 6 * TILE_SIZE;
const NOISE_DURATION_MS = 600;
const STATE_COLORS: Readonly<Record<GuardState, number>> = {
  patrullar: 0x6b8afd,
  investigar: 0xe5b454,
  buscar: 0xe08a3c,
  regresar: 0x5cc6c0,
  perseguir: 0xe16969,
};
const STATE_LABELS: Readonly<Record<GuardState, string>> = {
  patrullar: "PATRULLAR",
  investigar: "INVESTIGAR",
  buscar: "BUSCAR",
  regresar: "REGRESAR",
  perseguir: "PERSEGUIR",
};

interface SceneData {
  readonly seed?: number;
}

type Outcome = "jugando" | "victoria" | "atrapado";

function randomSeed(): number {
  return Math.floor(Math.random() * 999_999) + 1;
}

function initialSeed(): number {
  const fromUrl = Number(new URLSearchParams(window.location.search).get("seed"));
  return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : randomSeed();
}

export class GameScene extends Phaser.Scene {
  private level!: Level;
  private agent!: GuardAgent;
  private player!: Phaser.GameObjects.Rectangle;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private guardSprite!: Phaser.GameObjects.Arc;
  private keySprite!: Phaser.GameObjects.Rectangle;
  private exitSprite!: Phaser.GameObjects.Rectangle;
  private coneGraphics!: Phaser.GameObjects.Graphics;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private patrolLabels: Phaser.GameObjects.Text[] = [];
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private noise: SoundEvent | null = null;
  private hasKey = false;
  private outcome: Outcome = "jugando";

  public constructor() {
    super("GameScene");
  }

  private get algorithm(): SearchAlgorithm {
    return (this.registry.get("algorithm") as SearchAlgorithm | undefined) ?? "astar";
  }

  private get navigation(): NavigationMode {
    return (this.registry.get("navigation") as NavigationMode | undefined) ?? "terreno";
  }

  private get debug(): boolean {
    return (this.registry.get("debug") as boolean | undefined) ?? true;
  }

  public create(data: SceneData): void {
    this.applyUrlSettingsOnce();
    const seed = data.seed ?? initialSeed();
    this.level = generateLevel(seed);
    this.hasKey = false;
    this.outcome = "jugando";
    this.noise = null;
    this.patrolLabels = [];
    console.info(
      `[telemetria] escenario semilla=${seed} intentos=${this.level.attempts} respaldo=${this.level.fallback} `
      + `patrulla=${this.level.patrol.map((p) => `(${p.x},${p.y})`).join(" ")}`,
    );

    this.drawLevel();
    this.agent = new GuardAgent(
      this.level,
      { algorithm: this.algorithm, navigation: this.navigation },
      (message) => console.info(`[telemetria] ${message}`),
    );
    this.createInput();

    this.hud = this.add.text(8, LEVEL_HEIGHT * TILE_SIZE + 6, "", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#e6eef3",
      lineSpacing: 3,
    }).setDepth(20);
    this.banner = this.add.text(LEVEL_WIDTH * TILE_SIZE / 2, LEVEL_HEIGHT * TILE_SIZE / 2, "", {
      fontFamily: "monospace",
      fontSize: "30px",
      fontStyle: "bold",
      color: "#ffffff",
      backgroundColor: "#0b1015ee",
      padding: { x: 18, y: 12 },
      align: "center",
    }).setOrigin(0.5).setDepth(30).setVisible(false);
  }

  /** Permite abrir una configuración concreta: ?seed=777&algo=bfs&nav=corta&debug=0 */
  private applyUrlSettingsOnce(): void {
    if (this.registry.get("urlApplied")) return;
    this.registry.set("urlApplied", true);
    const params = new URLSearchParams(window.location.search);
    const algo = params.get("algo");
    if (algo && (SEARCH_ALGORITHMS as readonly string[]).includes(algo)) this.registry.set("algorithm", algo);
    const nav = params.get("nav");
    if (nav && (NAVIGATION_MODES as readonly string[]).includes(nav)) this.registry.set("navigation", nav);
    if (params.get("debug") === "0") this.registry.set("debug", false);
  }

  private drawLevel(): void {
    this.cameras.main.setBackgroundColor("#10161c");
    const floor = this.add.graphics().setDepth(0);
    for (const key of this.level.mud) {
      const [x, y] = key.split(",").map(Number);
      floor.fillStyle(0x5b4426, 1).fillRect(x! * TILE_SIZE, y! * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      floor.fillStyle(0x7a5a33, 1).fillCircle(x! * TILE_SIZE + 9, y! * TILE_SIZE + 11, 3);
      floor.fillCircle(x! * TILE_SIZE + 22, y! * TILE_SIZE + 21, 2);
    }
    floor.lineStyle(1, 0x1b252d, 1);
    for (let x = 0; x <= LEVEL_WIDTH; x += 1) floor.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, LEVEL_HEIGHT * TILE_SIZE);
    for (let y = 0; y <= LEVEL_HEIGHT; y += 1) floor.lineBetween(0, y * TILE_SIZE, LEVEL_WIDTH * TILE_SIZE, y * TILE_SIZE);

    const walls = this.physics.add.staticGroup();
    for (let y = 0; y < LEVEL_HEIGHT; y += 1) {
      for (let x = 0; x < LEVEL_WIDTH; x += 1) {
        if (!isWalkable(this.level.map, { x, y })) {
          const c = cellCenter({ x, y });
          const wall = this.add.rectangle(c.x, c.y, TILE_SIZE, TILE_SIZE, 0x2a3742).setStrokeStyle(1, 0x3d5060).setDepth(1);
          walls.add(wall);
        }
      }
    }

    this.debugGraphics = this.add.graphics().setDepth(2);
    this.coneGraphics = this.add.graphics().setDepth(3);

    const exit = cellCenter(this.level.exit);
    this.exitSprite = this.add.rectangle(exit.x, exit.y, 24, 24, 0x2f6b45).setStrokeStyle(2, 0x73c991).setDepth(4);
    this.add.text(exit.x, exit.y, "S", { fontFamily: "monospace", fontSize: "14px", color: "#d8ffe6" }).setOrigin(0.5).setDepth(5);
    const key = cellCenter(this.level.key);
    this.keySprite = this.add.rectangle(key.x, key.y, 14, 14, 0xffd34d).setAngle(45).setStrokeStyle(2, 0xfff1b8).setDepth(4);

    this.level.patrol.forEach((point, index) => {
      const c = cellCenter(point);
      this.patrolLabels.push(this.add.text(c.x, c.y, String(index), {
        fontFamily: "monospace", fontSize: "13px", color: "#9fb4ff",
      }).setOrigin(0.5).setDepth(4));
    });

    const spawn = cellCenter(this.level.player);
    this.player = this.add.rectangle(spawn.x, spawn.y, 18, 18, 0xe5b454).setStrokeStyle(2, 0xffd98a).setDepth(6);
    this.physics.add.existing(this.player);
    this.playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.physics.world.setBounds(0, 0, LEVEL_WIDTH * TILE_SIZE, LEVEL_HEIGHT * TILE_SIZE);
    this.playerBody.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, walls);

    const guard = cellCenter(this.level.guard);
    this.guardSprite = this.add.circle(guard.x, guard.y, CATCH_DISTANCE * 0.55 + 4, 0x6b8afd).setStrokeStyle(2, 0xdfe6ff).setDepth(6);
  }

  private createInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("Keyboard input is unavailable.");
    this.cursors = keyboard.createCursorKeys();
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      w: keyboard.addKey(K.W), a: keyboard.addKey(K.A), s: keyboard.addKey(K.S), d: keyboard.addKey(K.D),
      space: keyboard.addKey(K.SPACE), n: keyboard.addKey(K.N), g: keyboard.addKey(K.G),
      r: keyboard.addKey(K.R), q: keyboard.addKey(K.Q), t: keyboard.addKey(K.T),
    };
  }

  public update(time: number, delta: number): void {
    const pressed = (name: string): boolean => Phaser.Input.Keyboard.JustDown(this.keys[name]!);

    if (pressed("g")) {
      this.scene.restart({ seed: randomSeed() });
      return;
    }
    if (pressed("r")) {
      this.scene.restart({ seed: this.level.seed });
      return;
    }
    if (pressed("space")) {
      const next = SEARCH_ALGORITHMS[(SEARCH_ALGORITHMS.indexOf(this.algorithm) + 1) % SEARCH_ALGORITHMS.length]!;
      this.registry.set("algorithm", next);
    }
    if (pressed("n")) {
      const next = NAVIGATION_MODES[(NAVIGATION_MODES.indexOf(this.navigation) + 1) % NAVIGATION_MODES.length]!;
      this.registry.set("navigation", next);
    }
    if (pressed("t")) {
      this.registry.set("debug", !this.debug);
    }
    this.agent.setSettings({ algorithm: this.algorithm, navigation: this.navigation });

    if (this.outcome !== "jugando") {
      this.playerBody.setVelocity(0, 0);
      this.render(time);
      return;
    }

    if (pressed("q")) {
      this.noise = {
        position: { x: this.player.x, y: this.player.y },
        radius: NOISE_RADIUS,
        emittedAtMs: time,
        durationMs: NOISE_DURATION_MS,
      };
      console.info(`[telemetria] t=${Math.round(time)}ms ruido en (${worldToCell(this.player).x},${worldToCell(this.player).y})`);
    }
    if (this.noise && time > this.noise.emittedAtMs + this.noise.durationMs) {
      this.noise = null;
    }

    const h = Number(this.cursors.right.isDown || this.keys.d!.isDown) - Number(this.cursors.left.isDown || this.keys.a!.isDown);
    const v = Number(this.cursors.down.isDown || this.keys.s!.isDown) - Number(this.cursors.up.isDown || this.keys.w!.isDown);
    const velocity = new Phaser.Math.Vector2(h, v);
    if (velocity.lengthSq() > 0) velocity.normalize().scale(PLAYER_SPEED);
    this.playerBody.setVelocity(velocity.x, velocity.y);

    this.agent.update({ timeMs: time, deltaMs: Math.min(delta, 100), player: { x: this.player.x, y: this.player.y }, noise: this.noise });
    this.guardSprite.setPosition(this.agent.position.x, this.agent.position.y);

    const playerCell = worldToCell(this.player);
    if (!this.hasKey && samePointCell(playerCell, this.level.key)) {
      this.hasKey = true;
      this.keySprite.setVisible(false);
      this.exitSprite.setFillStyle(0x3fa866);
      console.info(`[telemetria] t=${Math.round(time)}ms llave obtenida`);
    }
    if (this.hasKey && samePointCell(playerCell, this.level.exit)) {
      this.finish("victoria", time);
    } else if (this.agent.catches({ x: this.player.x, y: this.player.y })) {
      this.finish("atrapado", time);
    }
    this.render(time);
  }

  private finish(outcome: Outcome, time: number): void {
    this.outcome = outcome;
    console.info(`[telemetria] t=${Math.round(time)}ms fin: ${outcome}`);
    this.banner
      .setText(outcome === "victoria" ? "¡VICTORIA!\nR reiniciar · G nuevo mapa" : "¡ATRAPADO!\nR reiniciar · G nuevo mapa")
      .setColor(outcome === "victoria" ? "#73c991" : "#ff8b8b")
      .setVisible(true);
  }

  private render(time: number): void {
    const state = this.agent.state;
    const color = STATE_COLORS[state];
    this.guardSprite.setFillStyle(color);

    // Cono de visión.
    this.coneGraphics.clear();
    const angle = Math.atan2(this.agent.facing.y, this.agent.facing.x);
    this.coneGraphics.fillStyle(color, state === "perseguir" ? 0.3 : 0.17);
    this.coneGraphics.beginPath();
    this.coneGraphics.moveTo(this.agent.position.x, this.agent.position.y);
    this.coneGraphics.arc(this.agent.position.x, this.agent.position.y, VISION_RANGE_CELLS * TILE_SIZE, angle - FIELD_OF_VIEW / 2, angle + FIELD_OF_VIEW / 2);
    this.coneGraphics.closePath();
    this.coneGraphics.fillPath();
    if (this.noise) {
      const progress = (time - this.noise.emittedAtMs) / this.noise.durationMs;
      this.coneGraphics.lineStyle(2, 0xffd98a, 1 - progress);
      this.coneGraphics.strokeCircle(this.noise.position.x, this.noise.position.y, this.noise.radius * Math.min(1, 0.3 + progress));
    }

    // Depuración: explorados, ruta, patrulla y memoria.
    this.debugGraphics.clear();
    this.patrolLabels.forEach((label) => label.setVisible(this.debug));
    const route = this.agent.route;
    if (this.debug && route) {
      this.debugGraphics.fillStyle(0x3b819c, 0.2);
      for (const p of route.explored) {
        this.debugGraphics.fillRect(p.x * TILE_SIZE + 4, p.y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      }
      if (route.path.length > 1) {
        this.debugGraphics.lineStyle(3, color, 0.9);
        this.debugGraphics.beginPath();
        const first = cellCenter(route.path[0]!);
        this.debugGraphics.moveTo(first.x, first.y);
        for (const p of route.path.slice(1)) {
          const c = cellCenter(p);
          this.debugGraphics.lineTo(c.x, c.y);
        }
        this.debugGraphics.strokePath();
      }
      this.level.patrol.forEach((p) => {
        const c = cellCenter(p);
        this.debugGraphics.lineStyle(1, 0x9fb4ff, 0.8).strokeCircle(c.x, c.y, 10);
      });
      const known = this.agent.memory.lastKnownPosition;
      if (known) {
        this.debugGraphics.lineStyle(2, 0xe16969, 0.9).strokeCircle(known.x, known.y, 7);
      }
    }

    const costNote = !supportsCosts(this.algorithm) && this.navigation === "terreno" ? "  (BFS ignora costos)" : "";
    const routeText = route
      ? route.status === "exito"
        ? `ruta: ${route.steps} pasos | costo terreno ${this.agent.lastRouteCost} | expandidos ${route.expandedNodes}`
        : `ruta: ${route.status.toUpperCase()}`
      : "ruta: -";
    this.hud.setText([
      `[Espacio] algoritmo: ${ALGORITHM_LABELS[this.algorithm]}   [N] navegación: ${NAVIGATION_LABELS[this.navigation]}${costNote}`,
      `guardia: ${STATE_LABELS[state]}   último cambio: ${this.agent.lastTransition}`,
      `${routeText}   búsquedas: ${this.agent.searchCount}`,
      `[G] semilla ${this.level.seed} (intentos ${this.level.attempts}${this.level.fallback ? ", RESPALDO" : ""})   `
        + `objetivo: ${this.hasKey ? "llegar a la SALIDA" : "tomar la LLAVE"}   [T] depuración ${this.debug ? "ON" : "OFF"}`,
    ]);
  }
}

