import * as Phaser from 'phaser';
import { GAME_CONFIG } from '@shared/constants';
import GameScene from '@client/scenes/GameScene';


const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#2d2d2d',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: GAME_CONFIG.WORLD.GRAVITY },
      debug: false
    }
  },
  scene: [GameScene]
};

new Phaser.Game(config);
