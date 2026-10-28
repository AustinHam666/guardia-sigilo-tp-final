import Phaser from "phaser";
import { TILE_SIZE } from "../application/guardAgent";
import { LEVEL_HEIGHT, LEVEL_WIDTH } from "../domain/level/level";
import { GameScene, HUD_HEIGHT } from "./scenes/GameScene";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: LEVEL_WIDTH * TILE_SIZE,
  height: LEVEL_HEIGHT * TILE_SIZE + HUD_HEIGHT,
  backgroundColor: "#10161c",
  physics: { default: "arcade", arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene],
};
