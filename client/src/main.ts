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

function installViewportInsetSync(): void {
  const sync = (): void => {
    const viewport = window.visualViewport;
    const bottomInset = viewport
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      : 0;

    document.documentElement.style.setProperty('--radiation-browser-bottom-inset', `${Math.round(bottomInset)}px`);
  };

  sync();
  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
}

installTouchGuards();
installViewportInsetSync();
new Phaser.Game(config);
