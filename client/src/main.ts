import Phaser from 'phaser';
import { ASSET_NAMES, PHYSICS } from '../shared/dist/constants';
import GameScene from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#2d2d2d',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: PHYSICS.GRAVITY },
      debug: false
    }
  },
  scene: [GameScene]
};

new Phaser.Game(config);
