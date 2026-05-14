import * as Phaser from 'phaser';
import { GAME_CONFIG } from '@shared/constants';
import LobbyScene from '@client/scenes/LobbyScene';


const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#2d2d2d',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: GAME_CONFIG.WORLD.GRAVITY },
      debug: false
    }
  },
  dom: {
    createContainer: true
  },
  scene: [LobbyScene]
};

function installTouchGuards(): void {
  document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (event) => event.preventDefault());
  document.addEventListener('contextmenu', (event) => event.preventDefault());
}

installTouchGuards();
new Phaser.Game(config);
