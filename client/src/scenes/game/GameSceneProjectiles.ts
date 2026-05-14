// @ts-nocheck
import * as Phaser from 'phaser';
import { GAME, GAME_CONFIG, MAP, TEAM, WEAPONS } from '@shared/constants';
import { MapBuilder } from '@client/entities/MapBuilder';
import { getPlayerSpawnY } from '@shared/utils/MapGeometry';
import { NetworkManager } from '@client/systems/NetworkManager';
import { Interpolator } from '@client/utils/Interpolator';
import type { GameEventPayload } from '@shared/types/network';
import { ANIMATION_KEYS, SPRITE_KEYS, WEAPON_POSE_KEYS } from './GameSceneConfig';
import { GameSceneWeaponInput } from './GameSceneWeaponInput';

export abstract class GameSceneProjectiles extends GameSceneWeaponInput {
  protected fireDirectProjectile(target: AimTarget): void {
    const firingWeapon = this.currentWeapon;
    const projectile = this.obtainProjectile();
    if (!projectile) {
      return;
    }

    if (!this.consumeLocalAmmo()) {
      this.disableProjectile(projectile);
      return;
    }

    if (this.network && firingWeapon !== 'fist' && (firingWeapon === 'pistol' || firingWeapon === 'auto' || firingWeapon === 'rpg')) {
      this.network.sendShot({ weapon: firingWeapon });
    }

    const isRocket = firingWeapon === 'rpg';
    const texture = isRocket ? SPRITE_KEYS.PROJECTILE_ROCKET : SPRITE_KEYS.PROJECTILE_BULLET;
    const projectileConfig = this.getDirectProjectileConfig(firingWeapon);
    const startX = this.weapon.x;
    const startY = this.weapon.y;
    const angle = Phaser.Math.Angle.Between(startX, startY, target.worldX, target.worldY);

    projectile.setTexture(texture);
    projectile.setPosition(startX, startY);
    projectile.setRotation(angle);
    projectile.setVelocity(Math.cos(angle) * projectileConfig.speed, Math.sin(angle) * projectileConfig.speed);
    (projectile.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.resizeProjectileBody(projectile);
    projectile.setData('expiresAt', this.time.now + 2000);
    projectile.setData('damage', projectileConfig.damage);
    projectile.setData('weapon', firingWeapon);
    projectile.setData('explosive', firingWeapon === 'rpg');
    projectile.setData('hitSent', false);
    projectile.setData('previousX', startX);
    projectile.setData('previousY', startY);
  }

  protected throwGrenade(target: AimTarget): void {
    const firingWeapon = this.currentWeapon;
    const projectile = this.obtainProjectile();
    if (!projectile) {
      return;
    }

    if (!this.consumeLocalAmmo()) {
      this.disableProjectile(projectile);
      return;
    }

    if (this.network && firingWeapon === 'grenade') {
      this.network.sendShot({ weapon: firingWeapon });
    }

    const charge = this.getGrenadeChargeRatio();
    const throwConfig = GAME_CONFIG.WEAPONS.GRENADE_THROW;
    const force = Phaser.Math.Linear(throwConfig.MIN_THROW_FORCE, throwConfig.MAX_THROW_FORCE, charge);
    const startX = this.weapon.x;
    const startY = this.weapon.y;
    const angle = Phaser.Math.Angle.Between(startX, startY, target.worldX, target.worldY);

    projectile.setTexture(SPRITE_KEYS.PROJECTILE_GRENADE);
    projectile.setPosition(startX, startY);
    projectile.setRotation(angle);
    projectile.setVelocity(Math.cos(angle) * force, Math.sin(angle) * force);
    (projectile.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
    this.resizeProjectileBody(projectile);
    projectile.setData('expiresAt', this.time.now + 2600);
    projectile.setData('damage', WEAPONS.GRENADE.damage);
    projectile.setData('weapon', firingWeapon);
    projectile.setData('explosive', true);
    projectile.setData('hitSent', false);
    projectile.setData('previousX', startX);
    projectile.setData('previousY', startY);
  }

  protected getDirectProjectileConfig(weapon: WeaponKind = this.currentWeapon): { speed: number; damage: number } {
    if (weapon === 'rpg') {
      return {
        speed: GAME_CONFIG.WEAPONS.DIRECT_PROJECTILE.ROCKET_SPEED,
        damage: WEAPONS.RPG.damage
      };
    }

    if (weapon === 'auto') {
      return {
        speed: GAME_CONFIG.WEAPONS.DIRECT_PROJECTILE.AUTO_BULLET_SPEED,
        damage: WEAPONS.AUTO.damage
      };
    }

    return {
      speed: GAME_CONFIG.WEAPONS.DIRECT_PROJECTILE.PISTOL_BULLET_SPEED,
      damage: WEAPONS.PISTOL.damage
    };
  }

  protected swingFist(): void {
    this.playFistArmAttack();

    if (!this.network) {
      return;
    }

    let closestId: string | undefined;
    let closestDistance = Number.MAX_SAFE_INTEGER;

    this.remotePlayers.forEach((remote, targetId) => {
      if (remote.team === this.team || remote.ghost) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, remote.body.x, remote.body.y);
      if (distance <= GAME_CONFIG.WEAPONS.MELEE_RANGE && distance < closestDistance) {
        closestId = targetId;
        closestDistance = distance;
      }
    });

    if (closestId) {
      this.network.sendHit(closestId, this.player.x, this.player.y, WEAPONS.FIST.damage);
    }
  }

  protected playFistArmAttack(): void {
    const armConfig = GAME_CONFIG.WEAPONS.FIST_ARM;

    this.fistArmTween?.stop();
    this.fistArm.setDisplaySize(armConfig.NORMAL_LENGTH, armConfig.THICKNESS);
    this.fistArmTween = this.tweens.add({
      targets: this.fistArm,
      displayWidth: armConfig.ATTACK_LENGTH,
      duration: armConfig.ATTACK_MS,
      yoyo: true,
      hold: 20,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.fistArm.setDisplaySize(armConfig.NORMAL_LENGTH, armConfig.THICKNESS);
        this.fistArmTween = undefined;
      }
    });
  }

  protected consumeLocalAmmo(): boolean {
    if (this.currentWeapon === 'fist') {
      return true;
    }

    if (this.currentAmmo <= 0) {
      this.setWeapon('fist');
      this.currentAmmo = -1;
      return false;
    }

    this.currentAmmo--;
    if (this.currentAmmo <= 0) {
      this.setWeapon('fist');
      this.currentAmmo = -1;
    }

    return true;
  }

  protected resizeProjectileBody(projectile: Phaser.Physics.Arcade.Sprite): void {
    const body = projectile.body as Phaser.Physics.Arcade.Body;
    body.setSize(projectile.width || 12, projectile.height || 5);
  }

  protected obtainProjectile(): Phaser.Physics.Arcade.Sprite | undefined {
    const projectile = this.projectiles.get() as Phaser.Physics.Arcade.Sprite | null;

    if (!projectile) {
      return undefined;
    }

    projectile.setActive(true);
    projectile.setVisible(true);
    projectile.setDepth(1);
    projectile.setData('expiresAt', this.time.now + 2000);

    const body = projectile.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setAllowGravity(false);
    body.setSize(projectile.width || 12, projectile.height || 5);

    return projectile;
  }

  protected checkProjectileHits(): void {
    this.projectiles.children.each((child) => {
      const projectile = child as Phaser.Physics.Arcade.Sprite;

      if (!projectile.active || projectile.getData('hitSent')) {
        return true;
      }

      const previousX = Number(projectile.getData('previousX'));
      const previousY = Number(projectile.getData('previousY'));

      if (!Number.isFinite(previousX) || !Number.isFinite(previousY)) {
        projectile.setData('previousX', projectile.x);
        projectile.setData('previousY', projectile.y);
        return true;
      }

      const line = new Phaser.Geom.Line(previousX, previousY, projectile.x, projectile.y);
      const explosive = Boolean(projectile.getData('explosive'));
      let hit = false;

      this.remotePlayers.forEach((remote, targetId) => {
        if (hit || remote.team === this.team || remote.ghost || !this.network) {
          return;
        }

        const bounds = remote.body.getBounds();
        Phaser.Geom.Rectangle.Inflate(bounds, 12, 12);

        if (Phaser.Geom.Intersects.LineToRectangle(line, bounds)) {
          if (explosive) {
            this.triggerProjectileExplosion(projectile, remote.body.x, remote.body.y);
          } else {
            projectile.setData('hitSent', true);
            this.network.sendHit(targetId, remote.body.x, remote.body.y, Number(projectile.getData('damage')) || WEAPONS.PISTOL.damage);
          }
          this.disableProjectile(projectile);
          hit = true;
        }
      });

      if (!hit) {
        projectile.setData('previousX', projectile.x);
        projectile.setData('previousY', projectile.y);
      }

      return true;
    });
  }

  protected handleProjectileCollision(projectileObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile): void {
    if (projectileObject instanceof Phaser.Tilemaps.Tile) {
      return;
    }

    const projectile = projectileObject as Phaser.Physics.Arcade.Sprite;
    this.triggerProjectileExplosion(projectile);
    this.disableProjectile(projectile);
  }

  protected handleProjectilePlayerOverlap(
    projectileObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    playerObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ): void {
    if (projectileObject instanceof Phaser.Tilemaps.Tile || playerObject instanceof Phaser.Tilemaps.Tile || !this.network) {
      return;
    }

    const projectile = projectileObject as Phaser.Physics.Arcade.Sprite;
    const target = playerObject as Phaser.Physics.Arcade.Sprite;
    const targetId = target.getData('playerId') as string | undefined;
    const remote = targetId ? this.remotePlayers.get(targetId) : undefined;

    if (!targetId || !remote || remote.ghost || projectile.getData('hitSent')) {
      return;
    }

    if (remote.team === this.team) {
      return;
    }

    if (projectile.getData('explosive')) {
      this.triggerProjectileExplosion(projectile, target.x, target.y);
      this.disableProjectile(projectile);
      return;
    }

    projectile.setData('hitSent', true);
    this.network.sendHit(targetId, target.x, target.y, Number(projectile.getData('damage')) || WEAPONS.PISTOL.damage);
    this.disableProjectile(projectile);
  }

  protected triggerProjectileExplosion(projectile: Phaser.Physics.Arcade.Sprite, x: number = projectile.x, y: number = projectile.y): void {
    if (!projectile.getData('explosive') || projectile.getData('hitSent') || !this.network) {
      return;
    }

    const weapon = projectile.getData('weapon') === 'rpg' ? 'rpg' : 'grenade';
    projectile.setData('hitSent', true);
    this.network.sendExplosion({
      weapon,
      x,
      y
    });
  }

  protected disableProjectile(projectileObject: Phaser.GameObjects.GameObject): void {
    const projectile = projectileObject as Phaser.Physics.Arcade.Sprite;
    const body = projectile.body as Phaser.Physics.Arcade.Body;

    body.stop();
    body.enable = false;
    projectile.setActive(false);
    projectile.setVisible(false);
  }

  protected recycleFarProjectiles(): void {
    const camera = this.cameras.main;

    this.projectiles.children.each((child) => {
      const projectile = child as Phaser.Physics.Arcade.Sprite;

      if (!projectile.active) {
        return true;
      }

      const expired = this.time.now >= (projectile.getData('expiresAt') as number);
      const outsideWorld = projectile.x < camera.worldView.x - 200 ||
        projectile.x > camera.worldView.right + 200 ||
        projectile.y < camera.worldView.y - 200 ||
        projectile.y > camera.worldView.bottom + 300;

      if (expired || outsideWorld) {
        if (projectile.getData('explosive')) {
          this.triggerProjectileExplosion(projectile);
        }
        this.disableProjectile(projectile);
      }

      return true;
    });
  }

  protected updateChargeBar(): void {
    this.chargeBar.clear();

    if (!this.isChargingGrenade) {
      return;
    }

    const config = GAME_CONFIG.WEAPONS.GRENADE_THROW.CHARGE_BAR;
    const ratio = this.getGrenadeChargeRatio();
    const x = this.player.x - config.WIDTH / 2;
    const y = this.player.y + config.OFFSET_Y;

    this.chargeBar.fillStyle(config.BACKGROUND_COLOR, 0.9);
    this.chargeBar.fillRect(x, y, config.WIDTH, config.HEIGHT);
    this.chargeBar.fillStyle(config.FILL_COLOR, 1);
    this.chargeBar.fillRect(x, y, config.WIDTH * ratio, config.HEIGHT);
    this.chargeBar.lineStyle(1, config.BORDER_COLOR, 1);
    this.chargeBar.strokeRect(x, y, config.WIDTH, config.HEIGHT);
  }

  protected getGrenadeChargeRatio(): number {
    const elapsed = this.time.now - this.grenadeChargeStartedAt;
    return Phaser.Math.Clamp(elapsed / GAME_CONFIG.WEAPONS.GRENADE_THROW.CHARGE_TIME_MS, 0, 1);
  }

  protected handleWeaponHotkeys(): void {
    if (this.network) {
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.ONE)) {
      this.setWeapon('pistol');
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.TWO)) {
      this.setWeapon('auto');
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.THREE)) {
      this.setWeapon('grenade');
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.FOUR)) {
      this.setWeapon('rpg');
    }
  }

  protected setWeapon(weapon: WeaponKind): void {
    if (weapon !== 'auto') {
      this.stopAutoFire();
    }

    this.currentWeapon = weapon;

    if (weapon === 'fist') {
      this.weapon.setVisible(false);
      return;
    }

    this.fistArmTween?.stop();
    this.fistArm.setVisible(false);
    this.fistArm.setDisplaySize(
      GAME_CONFIG.WEAPONS.FIST_ARM.NORMAL_LENGTH,
      GAME_CONFIG.WEAPONS.FIST_ARM.THICKNESS
    );
    this.weapon.setVisible(true);
    this.weapon.setTexture(this.getWeaponTexture(weapon));
    const poseConfig = GAME_CONFIG.WEAPONS.HAND_POSE[WEAPON_POSE_KEYS[weapon]];
    this.weapon.setOrigin(poseConfig.ORIGIN_X, 0.5);
    this.weapon.setScale(poseConfig.DISPLAY_SCALE);
  }
}
