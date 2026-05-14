import * as Phaser from 'phaser';
import { NETWORK } from '@shared/constants';

export class StatePredictor {
  correct(sprite: Phaser.Physics.Arcade.Sprite, serverX: number, serverY: number): void {
    const drift = Phaser.Math.Distance.Between(sprite.x, sprite.y, serverX, serverY);

    if (drift <= NETWORK.DRIFT_CORRECTION_THRESHOLD) {
      return;
    }

    sprite.setPosition(
      Phaser.Math.Linear(sprite.x, serverX, NETWORK.DRIFT_CORRECTION_ALPHA),
      Phaser.Math.Linear(sprite.y, serverY, NETWORK.DRIFT_CORRECTION_ALPHA)
    );
  }
}
