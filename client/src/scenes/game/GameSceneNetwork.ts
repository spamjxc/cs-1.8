// @ts-nocheck
import * as Phaser from 'phaser';
import { GAME, GAME_CONFIG, MAP, TEAM, WEAPONS } from '@shared/constants';
import { MapBuilder } from '@client/entities/MapBuilder';
import { getPlayerSpawnY } from '@shared/utils/MapGeometry';
import { NetworkManager } from '@client/systems/NetworkManager';
import { Interpolator } from '@client/utils/Interpolator';
import type { GameEventPayload } from '@shared/types/network';
import { ANIMATION_KEYS, SPRITE_KEYS, WEAPON_POSE_KEYS } from './GameSceneConfig';


export abstract class GameSceneNetwork extends Phaser.Scene {
  protected configureCamera(): void {
    const camera = this.cameras.main;

    camera.setZoom(GAME_CONFIG.CAMERA.ZOOM);
    camera.setDeadzone(200, 150);
    camera.setBounds(0, 0, MAP.WIDTH, MAP.HEIGHT);
    camera.setBackgroundColor('#1a1a1a');
    this.physics.world.setBounds(0, 0, MAP.WIDTH, MAP.HEIGHT);
  }

  protected addBaseZones(): void {
    this.add.rectangle(MAP.BASE_WIDTH / 2, MAP.HEIGHT / 2, MAP.BASE_WIDTH, MAP.HEIGHT, 0x8a2f2f, 0.24).setDepth(-1);
    this.add.rectangle(MAP.WIDTH - MAP.BASE_WIDTH / 2, MAP.HEIGHT / 2, MAP.BASE_WIDTH, MAP.HEIGHT, 0x2f568a, 0.24).setDepth(-1);
  }

  protected setupNetwork(): void {
    if (!this.room) {
      return;
    }

    this.network = new NetworkManager(this.room);
    this.network.onPlayer((player, id) => this.syncNetworkPlayer(player, id));
    this.network.onPlayerRemove((id) => this.removeRemotePlayer(id));
    this.network.onEvent((event) => this.handleNetworkEvent(event));
    this.network.start();
  }

  protected setupPickupStateSync(): void {
    const pickups = (this.room?.state as any)?.pickups;
    if (!pickups) {
      return;
    }

    pickups.forEach((pickup: any, id: string) => this.syncPickup(pickup, id));
    pickups.onAdd = (pickup: any, id: string) => this.syncPickup(pickup, id);
    pickups.onRemove = (_pickup: any, id: string) => this.removePickup(id);
  }

  protected syncPickup(pickup: any, id: string): void {
    const weapon = this.normalizeWeapon(pickup.weapon);
    if (weapon === 'fist') {
      return;
    }

    let sprite = this.pickupSprites.get(id);
    if (!sprite) {
      sprite = this.pickups.create(pickup.x, pickup.y, this.getWeaponTexture(weapon)) as Phaser.Physics.Arcade.Image;
      sprite.setData('pickupId', id);
      sprite.setData('weapon', weapon);
      sprite.setDepth(1);
      this.pickupSprites.set(id, sprite);
    }

    sprite.setTexture(this.getWeaponTexture(weapon));
    sprite.setPosition(this.toFiniteNumber(pickup.x, 0), this.toFiniteNumber(pickup.y, 0));
    sprite.setData('ammo', this.toFiniteNumber(pickup.ammo, 0));
    sprite.refreshBody();
  }

  protected removePickup(id: string): void {
    const sprite = this.pickupSprites.get(id);
    if (!sprite) {
      return;
    }

    sprite.destroy();
    this.pickupSprites.delete(id);
  }

  protected updateNetworkInput(): void {
    if (!this.network || this.adminModalOpen || this.time.now < this.suppressInputUntil) {
      return;
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const moveLeft = this.keys.A.isDown || this.cursors.left.isDown;
    const moveRight = this.keys.D.isDown || this.cursors.right.isDown;
    const move = moveLeft ? -1 : moveRight ? 1 : 0;
    const aimAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y - 8, this.input.activePointer.worldX, this.input.activePointer.worldY);

    this.network.sendInput(this.time.now, {
      move,
      jump: this.keys.W.isDown || this.keys.SPACE.isDown || this.cursors.up.isDown,
      crouch: Boolean(this.player.getData('crouching')),
      click: false,
      pickup: false,
      x: this.player.x,
      y: this.player.y,
      vx: body.velocity.x,
      vy: body.velocity.y,
      aimAngle
    });
  }

  protected syncNetworkPlayer(player: any, id: string): void {
    if (this.network && id === this.network.getSessionId()) {
      this.localHp = player.hp;
      this.localGhost = Boolean(player.ghost);
      this.team = player.team === TEAM.BLUE ? TEAM.BLUE : TEAM.RED;
      this.helmet?.setTexture(this.team === TEAM.RED ? SPRITE_KEYS.HELMET_RED : SPRITE_KEYS.HELMET_BLUE);
      this.syncLocalWeapon(player);
      this.applyLocalServerState(player);
      return;
    }

    let remote = this.remotePlayers.get(id);
    if (!remote) {
      remote = this.createRemotePlayer(player, id);
      this.remotePlayers.set(id, remote);
    }

    remote.team = player.team;
    remote.ghost = Boolean(player.ghost);
    remote.crouch = Boolean(player.crouch);
    remote.weaponKind = this.normalizeWeapon(player.weapon);
    remote.aimAngle = this.toFiniteNumber(player.aimAngle, 0);
    remote.interpolator.push({
      tick: this.toFiniteNumber(player.lastInputTick, 0),
      x: this.toFiniteNumber(player.x, 0),
      y: this.toFiniteNumber(player.y, 0),
      vx: this.toFiniteNumber(player.vx, 0),
      vy: this.toFiniteNumber(player.vy, 0)
    });
    remote.helmet.setTexture(player.team === TEAM.RED ? SPRITE_KEYS.HELMET_RED : SPRITE_KEYS.HELMET_BLUE);
    remote.name.setText(player.nick || 'Player');
    remote.hp?.setText(player.team === this.team ? `${Math.ceil(player.hp)} HP` : '');
    this.applyGhostVisual(remote.visual, Boolean(player.ghost));
    this.updateRemoteWeaponTexture(remote);
  }

  protected createRemotePlayer(player: any, id: string): RemotePlayerView {
    const body = this.physics.add.sprite(player.x, player.y, SPRITE_KEYS.PLAYER_IDLE);
    body.setVisible(false);
    body.setImmovable(true);
    body.body.allowGravity = false;
    body.setData('playerId', id);

    const visual = this.add.sprite(player.x, player.y, SPRITE_KEYS.PLAYER_IDLE).setDepth(1);
    const weaponKind = this.normalizeWeapon(player.weapon);
    const weapon = this.add.sprite(player.x, player.y, SPRITE_KEYS.WEAPON_PISTOL).setDepth(2);
    const fistArm = this.add.rectangle(
      player.x,
      player.y,
      GAME_CONFIG.WEAPONS.FIST_ARM.NORMAL_LENGTH,
      GAME_CONFIG.WEAPONS.FIST_ARM.THICKNESS,
      GAME_CONFIG.WEAPONS.FIST_ARM.FILL_COLOR,
      1
    )
      .setOrigin(0, 0.5)
      .setStrokeStyle(
        GAME_CONFIG.WEAPONS.FIST_ARM.STROKE_WIDTH,
        GAME_CONFIG.WEAPONS.FIST_ARM.STROKE_COLOR,
        1
      )
      .setDepth(2)
      .setVisible(false);
    const helmet = this.add.sprite(player.x, player.y - 22, player.team === TEAM.RED ? SPRITE_KEYS.HELMET_RED : SPRITE_KEYS.HELMET_BLUE).setDepth(3);
    const name = this.add.text(player.x, player.y - 48, player.nick || 'Player', {
      fontSize: '13px',
      color: '#e8f3d0',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5).setDepth(4);
    const hp = this.add.text(player.x, player.y - 62, '', {
      fontSize: '11px',
      color: '#9bdc4a',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5).setDepth(4);

    this.physics.add.overlap(this.projectiles, body, this.handleProjectilePlayerOverlap, undefined, this);

    return {
      body,
      visual,
      weapon,
      fistArm,
      helmet,
      name,
      hp,
      interpolator: new Interpolator(),
      team: player.team,
      ghost: Boolean(player.ghost),
      crouch: Boolean(player.crouch),
      lastVx: this.toFiniteNumber(player.vx, 0),
      weaponKind,
      aimAngle: this.toFiniteNumber(player.aimAngle, 0)
    };
  }

  protected updateRemotePlayers(): void {
    this.remotePlayers.forEach((remote) => {
      const sample = remote.interpolator.update();
      if (sample) {
        remote.body.setPosition(sample.x, sample.y);
        remote.visual.setPosition(sample.x, sample.y);
        remote.lastVx = sample.vx;
      }

      this.updateRemoteRunAnimation(remote);
      this.updateRemoteWeaponVisual(remote);

      const isRunning = !remote.ghost && !remote.crouch && Math.abs(remote.lastVx) > 10;
      const moveSign = remote.lastVx < -10 ? -1 : 1;
      const spriteFacingSign = remote.visual.flipX ? -1 : 1;
      const frameIndex = remote.visual.anims.currentFrame ? remote.visual.anims.currentFrame.index : 0;
      const helmetPose = this.getHelmetPoseForFrame(remote.crouch && !remote.ghost, isRunning, isRunning ? moveSign : spriteFacingSign, frameIndex);
      remote.helmet.setPosition(remote.visual.x + helmetPose.x, remote.visual.y + helmetPose.y);
      remote.name.setPosition(remote.helmet.x, remote.helmet.y + GAME_CONFIG.VISUALS.HELMET.NAME_OFFSET_Y);
      remote.hp?.setPosition(remote.helmet.x, remote.helmet.y + GAME_CONFIG.VISUALS.HELMET.NAME_OFFSET_Y - 14);
    });
  }

  protected updateRemoteRunAnimation(remote: RemotePlayerView): void {
    if (remote.ghost) {
      this.applyGhostVisual(remote.visual, true);
      return;
    }

    if (remote.crouch) {
      remote.visual.anims.stop();
      remote.visual.setTexture(SPRITE_KEYS.PLAYER_IDLE);
      remote.visual.setScale(1, GAME_CONFIG.PLAYER.CROUCH_VISUAL_SCALE_Y);
      remote.visual.setFlipX(remote.lastVx < -10);
    } else if (Math.abs(remote.lastVx) > 10) {
      remote.visual.setScale(1, 1);
      if (!remote.visual.anims.isPlaying || remote.visual.anims.currentAnim?.key !== ANIMATION_KEYS.PLAYER_RUN) {
        remote.visual.play(ANIMATION_KEYS.PLAYER_RUN);
      }
      remote.visual.setFlipX(remote.lastVx < 0);
    } else {
      remote.visual.setScale(1, 1);
      remote.visual.anims.stop();
      remote.visual.setTexture(SPRITE_KEYS.PLAYER_IDLE);
    }
  }

  protected updateRemoteWeaponTexture(remote: RemotePlayerView): void {
    if (remote.weaponKind === 'fist') {
      remote.weapon.setVisible(false);
      return;
    }

    remote.weapon.setTexture(this.getWeaponTexture(remote.weaponKind));
    const poseConfig = GAME_CONFIG.WEAPONS.HAND_POSE[WEAPON_POSE_KEYS[remote.weaponKind]];
    remote.weapon.setOrigin(poseConfig.ORIGIN_X, 0.5);
    remote.weapon.setScale(poseConfig.DISPLAY_SCALE);
  }

  protected updateRemoteWeaponVisual(remote: RemotePlayerView): void {
    const hidden = remote.ghost;
    const isFist = remote.weaponKind === 'fist';
    const angle = remote.aimAngle;
    const aimSign = Math.cos(angle) < 0 ? -1 : 1;
    const isRunning = !remote.ghost && !remote.crouch && Math.abs(remote.lastVx) > 10;
    const moveSign = remote.lastVx < -10 ? -1 : 1;
    const pose = this.getWeaponPoseForKind(remote.weaponKind, remote.crouch, isRunning, aimSign, moveSign);

    remote.weapon.setVisible(!hidden && !isFist);
    remote.fistArm.setVisible(!hidden && isFist);

    if (!hidden && !isFist) {
      remote.weapon.setPosition(remote.visual.x + pose.x, remote.visual.y + pose.y);
      remote.weapon.setRotation(angle);
      remote.weapon.setFlipY(aimSign < 0);
    }

    if (!hidden && isFist) {
      const armConfig = GAME_CONFIG.WEAPONS.FIST_ARM;
      remote.fistArm.setPosition(
        remote.visual.x + pose.x + Math.cos(angle) * armConfig.OFFSET_X,
        remote.visual.y + pose.y + armConfig.OFFSET_Y
      );
      remote.fistArm.setRotation(angle);
      remote.fistArm.setFillStyle(armConfig.FILL_COLOR, 1);
      remote.fistArm.setStrokeStyle(armConfig.STROKE_WIDTH, armConfig.STROKE_COLOR, 1);
    }
  }

  protected removeRemotePlayer(id: string): void {
    const remote = this.remotePlayers.get(id);
    if (!remote) {
      return;
    }

    remote.body.destroy();
    remote.visual.destroy();
    remote.weapon.destroy();
    remote.fistArm.destroy();
    remote.helmet.destroy();
    remote.name.destroy();
    remote.hp?.destroy();
    this.remotePlayers.delete(id);
  }

  protected applyLocalServerState(player: any): void {
    this.predictor.correct(
      this.player,
      this.toFiniteNumber(player.x, this.player.x),
      this.toFiniteNumber(player.y, this.player.y)
    );
    this.applyGhostVisual(this.playerVisual, Boolean(player.ghost));
    this.player.setData('ghost', Boolean(player.ghost));

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(!player.ghost);
    body.checkCollision.none = Boolean(player.ghost);
  }

  protected handleNetworkEvent(event: GameEventPayload): void {
    if (event.type === 'phase_change') {
      this.phase = this.normalizePhase(event.phase);
      this.phaseTimer = typeof event.timer === 'number' ? event.timer : this.phaseTimer;
      this.redScore = typeof event.redScore === 'number' ? event.redScore : this.redScore;
      this.blueScore = typeof event.blueScore === 'number' ? event.blueScore : this.blueScore;
      if (this.phase === 'fight') {
        this.clearCombatObjects();
      }
      if (event.stats) {
        this.lastStats = event.stats;
      }
      this.updateStatsOverlay();
      return;
    }

    if (event.type === 'stats') {
      if (event.stats) {
        this.lastStats = event.stats;
      }
      this.redScore = typeof event.redScore === 'number' ? event.redScore : this.redScore;
      this.blueScore = typeof event.blueScore === 'number' ? event.blueScore : this.blueScore;
      this.updateStatsOverlay();
      return;
    }

    if (event.type === 'admin') {
      this.handleAdminEvent(event);
      return;
    }

    if (event.type === 'chat' && event.message) {
      this.addChatMessage(event.message);
      return;
    }

    if (event.type === 'shoot') {
      if (!this.network || event.ownerId !== this.network.getSessionId()) {
        this.spawnRemoteProjectile(
          event.ownerId,
          event.weapon,
          this.toFiniteNumber(event.x, 0),
          this.toFiniteNumber(event.y, 0),
          this.toFiniteNumber(event.aimAngle, 0)
        );
      }
      return;
    }

    if (event.type === 'explode') {
      this.spawnExplosion(event.x || 0, event.y || 0, event.weapon);
      this.applyExplosionKnockback(event.x || 0, event.y || 0, event.radius || 0, event.knockback || 0);
      return;
    }

    if (this.network && event.targetId === this.network.getSessionId()) {
      if (event.type === 'respawn') {
        this.snapLocalToServerState(event);
        if (event.weapon) {
          this.setWeapon(event.weapon);
        }
        if (typeof event.ammo === 'number') {
          this.currentAmmo = event.ammo;
        }
      } else if (event.type === 'pickup' && event.weapon) {
        this.setWeapon(event.weapon);
        this.currentAmmo = typeof event.ammo === 'number' ? event.ammo : this.currentAmmo;
      } else if (event.type === 'ammo') {
        this.currentAmmo = typeof event.ammo === 'number' ? event.ammo : this.currentAmmo;
        if (event.weapon) {
          this.setWeapon(event.weapon);
        }
      } else {
        this.flashDamage(this.playerVisual, this.localGhost);
      }
    }

    const remote = event.targetId ? this.remotePlayers.get(event.targetId) : undefined;
    if (remote) {
      if (event.type === 'respawn') {
        const fallbackX = remote.team === TEAM.RED ? MAP.RED_SPAWN_X : MAP.BLUE_SPAWN_X;
        const x = event.x ?? fallbackX;
        const y = event.y ?? getPlayerSpawnY(this.getMapSeed(), fallbackX);
        remote.body.setPosition(x, y);
        remote.visual.setPosition(remote.body.x, remote.body.y);
        remote.lastVx = 0;
        remote.interpolator.reset({ tick: 0, x, y, vx: 0, vy: 0 });
        if (event.weapon) {
          remote.weaponKind = event.weapon;
          this.updateRemoteWeaponTexture(remote);
        }
      } else if ((event.type === 'pickup' || event.type === 'ammo') && event.weapon) {
        remote.weaponKind = event.weapon;
        this.updateRemoteWeaponTexture(remote);
      } else if (event.type === 'hit' || event.type === 'baseDamage' || event.type === 'death') {
        this.flashDamage(remote.visual, remote.ghost);
      }
    }
  }

  protected snapLocalToServerState(event: GameEventPayload): void {
    const state = this.room?.state as any;
    const player = state?.players?.get ? state.players.get(this.network?.getSessionId()) : undefined;
    const x = event.x ?? Number(player?.x);
    const y = event.y ?? Number(player?.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    this.player.setPosition(x, y);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAllowGravity(!this.localGhost);
    body.checkCollision.none = this.localGhost;
    this.suppressInputUntil = this.time.now + 250;
  }

  protected clearCombatObjects(): void {
    this.projectiles.children.each((child) => {
      this.disableProjectile(child as Phaser.GameObjects.GameObject);
      return true;
    });

    this.explosions.children.each((child) => {
      const explosion = child as Phaser.GameObjects.Sprite;
      explosion.setActive(false).setVisible(false);
      return true;
    });

    this.stopAutoFire();
    this.isChargingGrenade = false;
    this.chargeBar?.clear();
  }
}
