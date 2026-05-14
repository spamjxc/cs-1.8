// @ts-nocheck
import * as Phaser from 'phaser';
import { GAME, GAME_CONFIG, MAP, TEAM, WEAPONS } from '@shared/constants';
import { MapBuilder } from '@client/entities/MapBuilder';
import { getPlayerSpawnY } from '@shared/utils/MapGeometry';
import { NetworkManager } from '@client/systems/NetworkManager';
import { Interpolator } from '@client/utils/Interpolator';
import type { GameEventPayload } from '@shared/types/network';
import { ANIMATION_KEYS, SPRITE_KEYS, WEAPON_POSE_KEYS } from './GameSceneConfig';
import { GameSceneStateVisual } from './GameSceneStateVisual';

export abstract class GameSceneWeaponInput extends GameSceneStateVisual {
  protected handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.localGhost) {
      return;
    }

    if (pointer.rightButtonDown()) {
      return;
    }

    if (this.currentWeapon === 'grenade') {
      this.stopAutoFire();
      this.isChargingGrenade = true;
      this.grenadeChargeStartedAt = this.time.now;
      return;
    }

    if (this.currentWeapon === 'auto') {
      this.startAutoFire(pointer);
      return;
    }

    if (this.currentWeapon === 'fist') {
      this.swingFist();
      return;
    }

    this.fireDirectProjectile(pointer);
  }

  protected handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.isAutoFiring) {
      this.stopAutoFire();
      return;
    }

    if (!this.isChargingGrenade || this.currentWeapon !== 'grenade') {
      return;
    }

    this.throwGrenade(pointer);
    this.isChargingGrenade = false;
    this.chargeBar.clear();
  }

  protected installWindowMouseListeners(): void {
    window.addEventListener('mousedown', this.windowMouseDownHandler);
    window.addEventListener('mouseup', this.windowMouseUpHandler);
  }

  protected removeWindowMouseListeners(): void {
    window.removeEventListener('mousedown', this.windowMouseDownHandler);
    window.removeEventListener('mouseup', this.windowMouseUpHandler);
  }

  protected handleWindowMouseDown(event: MouseEvent): void {
    if (this.localGhost) {
      return;
    }

    if (event.button !== 0 || event.target === this.game.canvas) {
      return;
    }

    const target = this.getWorldTargetFromWindowEvent(event);

    if (this.currentWeapon === 'grenade') {
      this.stopAutoFire();
      this.isChargingGrenade = true;
      this.grenadeChargeStartedAt = this.time.now;
      return;
    }

    if (this.currentWeapon === 'auto') {
      this.startAutoFire(target);
      return;
    }

    if (this.currentWeapon === 'fist') {
      this.swingFist();
      return;
    }

    this.fireDirectProjectile(target);
  }

  protected handleWindowMouseUp(event: MouseEvent): void {
    if (event.button === 0 && this.isAutoFiring) {
      this.stopAutoFire();
      return;
    }

    if (event.button !== 0 || event.target === this.game.canvas || !this.isChargingGrenade || this.currentWeapon !== 'grenade') {
      return;
    }

    this.throwGrenade(this.getWorldTargetFromWindowEvent(event));
    this.isChargingGrenade = false;
    this.chargeBar.clear();
  }

  protected getWorldTargetFromWindowEvent(event: MouseEvent): AimTarget {
    const rect = this.game.canvas.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * (this.scale.width / rect.width);
    const screenY = (event.clientY - rect.top) * (this.scale.height / rect.height);
    const worldPoint = this.cameras.main.getWorldPoint(screenX, screenY);

    return {
      worldX: worldPoint.x,
      worldY: worldPoint.y
    };
  }

  protected startAutoFire(target: AimTarget): void {
    this.isChargingGrenade = false;
    this.chargeBar.clear();
    this.isAutoFiring = true;
    this.autoFireTarget = target;
    this.fireDirectProjectile(target);
    this.nextAutoShotAt = this.time.now + this.getAutoFireIntervalMs();
  }

  protected stopAutoFire(): void {
    this.isAutoFiring = false;
    this.autoFireTarget = undefined;
  }

  protected updateAutoFire(): void {
    if (!this.isAutoFiring || this.currentWeapon !== 'auto' || this.localGhost) {
      this.stopAutoFire();
      return;
    }

    const pointer = this.input.activePointer;
    if (!pointer.isDown && !this.autoFireTarget) {
      this.stopAutoFire();
      return;
    }

    if (this.time.now < this.nextAutoShotAt) {
      return;
    }

    const target = pointer.isDown
      ? { worldX: pointer.worldX, worldY: pointer.worldY }
      : this.autoFireTarget;

    if (!target) {
      this.stopAutoFire();
      return;
    }

    this.autoFireTarget = target;
    this.fireDirectProjectile(target);
    this.nextAutoShotAt = this.time.now + this.getAutoFireIntervalMs();
  }

  protected getAutoFireIntervalMs(): number {
    return 1000 / GAME_CONFIG.WEAPONS.DIRECT_PROJECTILE.AUTO_FIRE_RATE_PER_SEC;
  }
}
