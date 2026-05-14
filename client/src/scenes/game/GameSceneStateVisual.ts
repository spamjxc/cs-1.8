// @ts-nocheck
import * as Phaser from 'phaser';
import { ASSET_NAMES, ASSET_SPECS, GAME, GAME_CONFIG, MAP, TEAM, WEAPONS } from '@shared/constants';
import { MapBuilder } from '@client/entities/MapBuilder';
import { getPlayerSpawnY } from '@shared/utils/MapGeometry';
import { NetworkManager } from '@client/systems/NetworkManager';
import { Interpolator } from '@client/utils/Interpolator';
import type { GameEventPayload } from '@shared/types/network';
import { ANIMATION_KEYS, SPRITE_KEYS, WEAPON_POSE_KEYS } from './GameSceneConfig';
import { GameSceneAdmin } from './GameSceneAdmin';

export abstract class GameSceneStateVisual extends GameSceneAdmin {
  protected getLocalGhostTimer(): number {
    const state = this.room?.state as any;
    const player = state?.players?.get ? state.players.get(this.network?.getSessionId()) : undefined;
    return this.toFiniteNumber(player?.ghostTimer, 0);
  }

  protected isLocalInEnemyBase(): boolean {
    return (this.team === TEAM.BLUE && this.player.x < MAP.BASE_WIDTH) ||
      (this.team === TEAM.RED && this.player.x > MAP.WIDTH - MAP.BASE_WIDTH);
  }

  protected createMobileControls(): void {
    this.input.addPointer(3);
    this.mobileStickGraphics = this.add.graphics().setScrollFactor(0).setDepth(1002);
    this.mobileFireGraphics = this.add.graphics().setScrollFactor(0).setDepth(1003);
    this.refreshMobileControlsMode();

    if (this.game.canvas) {
      this.game.canvas.style.touchAction = 'none';
    }
  }

  protected refreshMobileControlsMode(): void {
    const width = this.scale.width || window.innerWidth || 1280;
    const height = this.scale.height || window.innerHeight || 720;
    const shouldEnable = width <= GAME_CONFIG.MOBILE.SMALL_SCREEN_WIDTH ||
      height <= GAME_CONFIG.MOBILE.SMALL_SCREEN_HEIGHT;

    if (shouldEnable === this.mobileControlsEnabled) {
      return;
    }

    this.mobileControlsEnabled = shouldEnable;
    if (!shouldEnable) {
      this.resetMobileControls();
    }
  }

  protected shouldUseMobileControls(): boolean {
    return Boolean(this.mobileControlsEnabled);
  }

  protected updateMobileControls(): void {
    if (!this.shouldUseMobileControls()) {
      return;
    }

    if (this.mobileUpHeld && this.time.now >= this.mobileNextHeldJumpAt) {
      this.mobileJumpQueued = true;
      this.mobileNextHeldJumpAt = this.time.now + GAME_CONFIG.MOBILE.DOUBLE_JUMP_DELAY_MS;
    }

    this.drawMobileControls();
  }

  protected resetMobileControls(): void {
    this.mobileMovePointerId = undefined;
    this.mobileFirePointerId = undefined;
    this.mobileMoveVector.set(0, 0);
    this.mobileUpHeld = false;
    this.mobileJumpQueued = false;
    this.mobileAimTarget = undefined;
    this.mobileStickGraphics?.clear();
    this.mobileFireGraphics?.clear();
    this.stopAutoFire?.();
    this.isChargingGrenade = false;
    this.chargeBar?.clear();
  }

  protected destroyMobileControls(): void {
    this.resetMobileControls();
    this.mobileStickGraphics?.destroy();
    this.mobileFireGraphics?.destroy();
    this.mobileStickGraphics = undefined;
    this.mobileFireGraphics = undefined;
  }

  protected getPointerId(pointer: Phaser.Input.Pointer): number {
    return typeof pointer.pointerId === 'number' ? pointer.pointerId : pointer.id;
  }

  protected getTargetFromPointer(pointer: Phaser.Input.Pointer): AimTarget {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    return {
      worldX: worldPoint.x,
      worldY: worldPoint.y
    };
  }

  protected startMobileMove(pointer: Phaser.Input.Pointer): void {
    const pointerId = this.getPointerId(pointer);
    this.mobileMovePointerId = pointerId;
    this.mobileStickBase.set(pointer.x, pointer.y);
    this.mobileStickKnob.copy(this.mobileStickBase);
    this.mobileMoveVector.set(0, 0);
    this.mobileUpHeld = false;
    this.mobileJumpQueued = false;
    this.drawMobileControls();
  }

  protected updateMobileMove(pointer: Phaser.Input.Pointer): void {
    const config = GAME_CONFIG.MOBILE;
    const dx = pointer.x - this.mobileStickBase.x;
    const dy = pointer.y - this.mobileStickBase.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = config.STICK_RADIUS;
    const clampedDistance = Math.min(distance, maxDistance);
    const angle = Math.atan2(dy, dx);
    const normalizer = distance > config.STICK_DEADZONE ? maxDistance : 1;

    this.mobileStickKnob.set(
      this.mobileStickBase.x + Math.cos(angle) * clampedDistance,
      this.mobileStickBase.y + Math.sin(angle) * clampedDistance
    );

    if (distance <= config.STICK_DEADZONE) {
      this.mobileMoveVector.set(0, 0);
    } else {
      this.mobileMoveVector.set(
        Phaser.Math.Clamp(dx / normalizer, -1, 1),
        Phaser.Math.Clamp(dy / normalizer, -1, 1)
      );
    }

    const upHeld = this.mobileMoveVector.y <= config.JUMP_THRESHOLD;
    if (upHeld && !this.mobileUpHeld) {
      this.mobileJumpQueued = true;
      this.mobileNextHeldJumpAt = this.time.now + config.DOUBLE_JUMP_DELAY_MS;
    }

    this.mobileUpHeld = upHeld;
  }

  protected stopMobileMove(): void {
    this.mobileMovePointerId = undefined;
    this.mobileMoveVector.set(0, 0);
    this.mobileUpHeld = false;
    this.mobileJumpQueued = false;

    if (this.mobileFirePointerId !== undefined) {
      this.mobileFirePointerId = undefined;
      this.mobileAimTarget = undefined;
      this.stopAutoFire?.();
      this.isChargingGrenade = false;
      this.chargeBar?.clear();
    }

    this.drawMobileControls();
  }

  protected setMobileAimFromPointer(pointer: Phaser.Input.Pointer): void {
    this.mobileAimTarget = this.getTargetFromPointer(pointer);
    this.lastAimTarget = this.mobileAimTarget;
  }

  protected stopMobileFire(): void {
    this.mobileFirePointerId = undefined;
    this.mobileAimTarget = undefined;
    this.drawMobileControls();
  }

  protected getHorizontalMoveDirection(): -1 | 0 | 1 {
    const moveLeft = this.keys.A.isDown || this.cursors.left.isDown ||
      (this.shouldUseMobileControls() && this.mobileMoveVector.x < -GAME_CONFIG.MOBILE.MOVE_THRESHOLD);
    const moveRight = this.keys.D.isDown || this.cursors.right.isDown ||
      (this.shouldUseMobileControls() && this.mobileMoveVector.x > GAME_CONFIG.MOBILE.MOVE_THRESHOLD);

    if (moveLeft) {
      return -1;
    }

    if (moveRight) {
      return 1;
    }

    return 0;
  }

  protected getVerticalMoveDirection(): -1 | 0 | 1 {
    const moveUp = this.keys.W.isDown || this.keys.SPACE.isDown || this.cursors.up.isDown ||
      (this.shouldUseMobileControls() && this.mobileMoveVector.y < -GAME_CONFIG.MOBILE.MOVE_THRESHOLD);
    const moveDown = this.keys.S.isDown || this.cursors.down.isDown ||
      (this.shouldUseMobileControls() && this.mobileMoveVector.y > GAME_CONFIG.MOBILE.MOVE_THRESHOLD);

    if (moveUp) {
      return -1;
    }

    if (moveDown) {
      return 1;
    }

    return 0;
  }

  protected consumeMobileJumpRequest(): boolean {
    const requested = Boolean(this.mobileJumpQueued);
    this.mobileJumpQueued = false;
    return requested;
  }

  protected isJumpInputDown(): boolean {
    return this.keys.W.isDown || this.keys.SPACE.isDown || this.cursors.up.isDown ||
      (this.shouldUseMobileControls() && this.mobileUpHeld);
  }

  protected isCrouchInputDown(): boolean {
    return this.keys.CTRL.isDown || this.keys.S.isDown || this.cursors.down.isDown ||
      (this.shouldUseMobileControls() && this.mobileMoveVector.y > GAME_CONFIG.MOBILE.CROUCH_THRESHOLD);
  }

  protected getCurrentAimTarget(): AimTarget {
    if (this.shouldUseMobileControls()) {
      const fallbackSign = this.playerVisual?.flipX ? -1 : 1;
      const fallback = {
        worldX: this.player.x + fallbackSign * 160,
        worldY: this.player.y - 8
      };

      return this.mobileAimTarget || this.lastAimTarget || fallback;
    }

    return {
      worldX: this.input.activePointer.worldX,
      worldY: this.input.activePointer.worldY
    };
  }

  protected drawMobileControls(): void {
    const stick = this.mobileStickGraphics;
    const fire = this.mobileFireGraphics;

    stick?.clear();
    fire?.clear();

    if (!this.shouldUseMobileControls()) {
      return;
    }

    if (this.mobileMovePointerId !== undefined && stick) {
      const radius = GAME_CONFIG.MOBILE.STICK_RADIUS;
      stick.fillStyle(0x11180f, 0.52);
      stick.fillCircle(this.mobileStickBase.x, this.mobileStickBase.y, radius);
      stick.lineStyle(2, 0x9bdc4a, 0.72);
      stick.strokeCircle(this.mobileStickBase.x, this.mobileStickBase.y, radius);
      stick.lineStyle(1, 0xe8f3d0, 0.28);
      stick.beginPath();
      stick.moveTo(this.mobileStickBase.x - radius * 0.62, this.mobileStickBase.y);
      stick.lineTo(this.mobileStickBase.x + radius * 0.62, this.mobileStickBase.y);
      stick.moveTo(this.mobileStickBase.x, this.mobileStickBase.y - radius * 0.62);
      stick.lineTo(this.mobileStickBase.x, this.mobileStickBase.y + radius * 0.62);
      stick.strokePath();
      stick.fillStyle(0x9bdc4a, 0.32);
      stick.fillCircle(this.mobileStickKnob.x, this.mobileStickKnob.y, 24);
      stick.lineStyle(2, 0xe8f3d0, 0.72);
      stick.strokeCircle(this.mobileStickKnob.x, this.mobileStickKnob.y, 24);
    }

    if (this.mobileFirePointerId !== undefined && this.mobileAimTarget && fire) {
      const camera = this.cameras.main;
      const zoom = camera.zoom || 1;
      const x = (this.mobileAimTarget.worldX - camera.worldView.x) * zoom;
      const y = (this.mobileAimTarget.worldY - camera.worldView.y) * zoom;

      fire.lineStyle(2, 0xf1d27a, 0.82);
      fire.strokeCircle(x, y, 18);
      fire.beginPath();
      fire.moveTo(x - 28, y);
      fire.lineTo(x - 10, y);
      fire.moveTo(x + 10, y);
      fire.lineTo(x + 28, y);
      fire.moveTo(x, y - 28);
      fire.lineTo(x, y - 10);
      fire.moveTo(x, y + 10);
      fire.lineTo(x, y + 28);
      fire.strokePath();
    }
  }

  protected getMapSeed(): number {
    const state = this.room?.state as any;
    return this.toFiniteNumber(state?.mapSeed, MAP.DEFAULT_SEED);
  }

  protected syncMatchState(): void {
    const state = this.room?.state as any;
    if (!state) {
      this.phase = 'fight';
      return;
    }

    const phase = this.normalizePhase(state.phase);
    if (phase !== this.phase) {
      this.phase = phase;
      this.updateStatsOverlay();
    }

    this.phaseTimer = Math.max(0, this.toFiniteNumber(state.phaseTimer, 0));
    this.redScore = this.toFiniteNumber(state.redScore, 0);
    this.blueScore = this.toFiniteNumber(state.blueScore, 0);
    this.autoBalance = Boolean(state.autoBalance);
    this.updateAdminPanel();
    if (this.phase === 'pause') {
      this.updateStatsOverlay();
    }

    const seed = this.getMapSeed();
    if (seed !== this.currentMapSeed && this.groundGroup) {
      this.rebuildMap(seed);
    }
  }

  protected normalizePhase(phase: unknown): MatchPhase {
    return phase === 'lobby' || phase === 'pause' || phase === 'fight' ? phase : 'fight';
  }

  protected rebuildMap(seed: number): void {
    this.currentMapSeed = seed;
    this.groundGroup.clear(true, true);
    new MapBuilder(this.groundGroup, {
      floor: SPRITE_KEYS.FLOOR,
      box: SPRITE_KEYS.BOX
    }).build(seed);
    this.pickupSprites.forEach((sprite) => sprite.destroy());
    this.pickupSprites.clear();
    this.setupPickupStateSync();
  }

  protected syncLocalWeapon(player: any): void {
    const weapon = this.normalizeWeapon(player.weapon);
    const ammo = this.toFiniteNumber(player.ammo, Number.NaN);

    if (weapon !== this.currentWeapon) {
      this.setWeapon(weapon);
    }

    if (Number.isFinite(ammo)) {
      this.currentAmmo = ammo;
    }
  }

  protected normalizeWeapon(weapon: unknown): WeaponKind {
    return weapon === 'fist' || weapon === 'auto' || weapon === 'grenade' || weapon === 'rpg' || weapon === 'pistol'
      ? weapon
      : 'pistol';
  }

  protected getWeaponTexture(weapon: Exclude<WeaponKind, 'fist'>): string {
    const textureByWeapon: Record<Exclude<WeaponKind, 'fist'>, string> = {
      pistol: SPRITE_KEYS.WEAPON_PISTOL,
      auto: SPRITE_KEYS.WEAPON_AUTO,
      grenade: SPRITE_KEYS.WEAPON_GRENADE,
      rpg: SPRITE_KEYS.WEAPON_RPG
    };

    return textureByWeapon[weapon];
  }

  protected getWeaponLabel(): string {
    const labels: Record<WeaponKind, string> = {
      fist: 'Кулаки',
      pistol: 'Пистолет',
      auto: 'Автомат',
      grenade: 'Граната',
      rpg: 'Базука'
    };

    return labels[this.currentWeapon];
  }

  protected getAmmoLabel(): string {
    return this.currentWeapon === 'fist' || this.currentAmmo < 0 ? '∞' : String(this.currentAmmo);
  }

  protected getCurrentWeaponAssetName(): string {
    const assets: Record<WeaponKind, string> = {
      fist: ASSET_NAMES.WEAPON_PISTOL,
      pistol: ASSET_NAMES.WEAPON_PISTOL,
      auto: ASSET_NAMES.WEAPON_AUTO,
      grenade: ASSET_NAMES.WEAPON_GRENADE,
      rpg: ASSET_NAMES.WEAPON_RPG
    };

    return assets[this.currentWeapon];
  }

  protected tryPickupWeapon(): void {
    if (!this.network || !this.player.getData('crouching') || this.time.now < this.nextPickupAt || this.pickedDuringCurrentCrouch) {
      return;
    }

    let nearest: Phaser.Physics.Arcade.Image | undefined;
    let nearestDistance = Number.MAX_SAFE_INTEGER;

    this.pickupSprites.forEach((pickup) => {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, pickup.x, pickup.y);
      if (distance < nearestDistance) {
        nearest = pickup;
        nearestDistance = distance;
      }
    });

    if (!nearest || nearestDistance > GAME_CONFIG.WEAPONS.PICKUP_RADIUS) {
      return;
    }

    const pickupId = nearest.getData('pickupId') as string | undefined;
    if (!pickupId) {
      return;
    }

    this.network.sendPickup({ pickupId, crouch: Boolean(this.player.getData('crouching')) });
    this.nextPickupAt = this.time.now + GAME.PICKUP_COOLDOWN;
    this.pickedDuringCurrentCrouch = true;
  }

  protected spawnExplosion(x: number, y: number, weapon?: WeaponKind, radius?: number): void {
    const explosion = this.explosions.get(x, y, SPRITE_KEYS.EXPLOSION) as Phaser.GameObjects.Sprite | null;
    if (!explosion) {
      return;
    }

    const fallbackRadius = weapon === 'grenade'
      ? GAME_CONFIG.WEAPONS.EXPLOSION.GRENADE_RADIUS
      : weapon === 'rpg'
        ? GAME_CONFIG.WEAPONS.EXPLOSION.RPG_RADIUS
        : ASSET_SPECS.EFFECT.EXPLOSION.width * ASSET_SPECS.EFFECT.EXPLOSION.endScale / 2;
    const blastRadius = Math.max(1, this.toFiniteNumber(radius, fallbackRadius));
    const targetScale = (blastRadius * 2) / ASSET_SPECS.EFFECT.EXPLOSION.width;
    const startScale = targetScale * (ASSET_SPECS.EFFECT.EXPLOSION.startScale / ASSET_SPECS.EFFECT.EXPLOSION.endScale);

    explosion.setActive(true).setVisible(true).setPosition(x, y);
    explosion.setScale(startScale);
    explosion.setAlpha(0.9);
    explosion.setDepth(5);

    this.tweens.add({
      targets: explosion,
      scale: targetScale,
      alpha: 0,
      duration: ASSET_SPECS.EFFECT.EXPLOSION.durationMs,
      onComplete: () => {
        explosion.setActive(false).setVisible(false);
      }
    });
  }

  protected applyExplosionKnockback(x: number, y: number, radius: number, maxKnockback: number): void {
    if (radius <= 0 || maxKnockback <= 0 || this.localGhost) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y);
    if (distance > radius) {
      return;
    }

    const force = (1 - distance / radius) * maxKnockback;
    const angle = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(angle) * force, Math.sin(angle) * force);
  }

  protected handleGhostMovement(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const x = this.getHorizontalMoveDirection();
    const y = this.getVerticalMoveDirection();

    body.setVelocity(x * GAME_CONFIG.PLAYER.GHOST_MOVE_SPEED, y * GAME_CONFIG.PLAYER.GHOST_MOVE_SPEED);
    body.setAllowGravity(false);
    this.isChargingGrenade = false;
    this.chargeBar.clear();
  }

  protected applyGhostVisual(sprite: Phaser.GameObjects.Sprite, ghost: boolean): void {
    if (ghost) {
      sprite.anims.stop();
      sprite.setTexture(SPRITE_KEYS.PLAYER_GHOST);
      sprite.setAlpha(0.4);
      return;
    }

    if (sprite.texture.key === SPRITE_KEYS.PLAYER_GHOST || sprite.texture.key === SPRITE_KEYS.PLAYER_DAMAGE) {
      sprite.anims.stop();
      sprite.setTexture(SPRITE_KEYS.PLAYER_IDLE);
    }
    sprite.setAlpha(1);
  }

  protected flashDamage(sprite: Phaser.GameObjects.Sprite, ghost: boolean): void {
    sprite.setTint(0xff8a8a);
    this.tweens.add({
      targets: sprite,
      alpha: ghost ? 0.32 : 0.82,
      yoyo: true,
      duration: 80,
      repeat: 2,
      onComplete: () => {
        sprite.clearTint();
        this.applyGhostVisual(sprite, ghost);
      }
    });
  }

  protected handleJump(): void {
    if (this.localGhost) {
      return;
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.keys.W) ||
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      this.consumeMobileJumpRequest();

    if (body.touching.down || body.blocked.down) {
      this.jumpsLeft = 2;
    }

    if (jumpPressed && this.jumpsLeft > 0) {
      const force = this.jumpsLeft === 2 ? GAME_CONFIG.PLAYER.JUMP_FORCE : GAME_CONFIG.PLAYER.DOUBLE_JUMP_FORCE;
      body.setVelocityY(force);
      this.jumpsLeft--;
    }
  }

  protected applyJumpGravity(): void {
    if (this.localGhost) {
      return;
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const isGrounded = body.touching.down || body.blocked.down;
    const multiplier = isGrounded
      ? 1
      : body.velocity.y > 0
        ? GAME_CONFIG.PLAYER.FALL_GRAVITY_MULTIPLIER
        : GAME_CONFIG.PLAYER.RISE_GRAVITY_MULTIPLIER;

    body.setGravityY(GAME_CONFIG.WORLD.GRAVITY * (multiplier - 1));
    body.setMaxVelocityY(GAME_CONFIG.PLAYER.MAX_FALL_SPEED);
  }

  protected handleCrouch(): void {
    const isCrouching = this.isCrouchInputDown();

    if (isCrouching === this.player.getData('crouching')) {
      return;
    }

    this.player.setData('crouching', isCrouching);

    if (isCrouching) {
      this.moveSpeed = GAME_CONFIG.PLAYER.MOVE_SPEED / 2;
    } else {
      this.moveSpeed = GAME_CONFIG.PLAYER.MOVE_SPEED;
      this.pickedDuringCurrentCrouch = false;
    }
  }

  protected updatePlayerVisual(): void {
    const isCrouching = Boolean(this.player.getData('crouching'));
    const scaleY = isCrouching ? GAME_CONFIG.PLAYER.CROUCH_VISUAL_SCALE_Y : 1;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const feetY = body.bottom;
    const visualHeight = ASSET_SPECS.PLAYER.IDLE.height * scaleY;

    this.playerVisual.setScale(1, scaleY);
    this.playerVisual.setPosition(this.player.x, feetY - visualHeight / 2);
    this.playerVisual.setDepth(1);
  }

  protected updateAttachedVisuals(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const isCrouching = Boolean(this.player.getData('crouching'));
    const isRunning = !this.localGhost && !isCrouching && Math.abs(body.velocity.x) > 10;
    const moveSign = body.velocity.x < -10 ? -1 : 1;
    const aimTarget = this.getCurrentAimTarget();
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y - 8, aimTarget.worldX, aimTarget.worldY);
    const aimSign = Math.cos(angle) < 0 ? -1 : 1;
    const facingLeft = aimSign < 0;
    const weaponPose = this.getWeaponPose(isCrouching, isRunning, aimSign, moveSign);
    const spriteFacingSign = this.playerVisual.flipX ? -1 : 1;
    const helmetPose = this.getHelmetPose(isCrouching && !this.localGhost, isRunning, isRunning ? moveSign : spriteFacingSign);

    this.weapon.setVisible(this.currentWeapon !== 'fist' && !this.localGhost);
    this.weapon.setPosition(this.player.x + weaponPose.x, this.player.y + weaponPose.y);
    this.weapon.setRotation(angle);
    this.weapon.setFlipY(facingLeft);
    this.weapon.setScale(this.getCurrentWeaponPoseConfig().DISPLAY_SCALE);
    this.weapon.setDepth(2);
    this.updateFistArmVisual(angle, weaponPose);

    this.helmet.setPosition(this.playerVisual.x + helmetPose.x, this.playerVisual.y + helmetPose.y);
    this.helmet.setDepth(3);
    this.playerName?.setPosition(this.helmet.x, this.helmet.y + GAME_CONFIG.VISUALS.HELMET.NAME_OFFSET_Y);
  }

  protected getWeaponPose(isCrouching: boolean, isRunning: boolean, aimSign: number, moveSign: number): PosePoint {
    return this.getWeaponPoseForKind(this.currentWeapon, isCrouching, isRunning, aimSign, moveSign);
  }

  protected getWeaponPoseForKind(weapon: WeaponKind, isCrouching: boolean, isRunning: boolean, aimSign: number, moveSign: number): PosePoint {
    const config = weapon === 'fist'
      ? GAME_CONFIG.WEAPONS.HAND_POSE.PISTOL
      : GAME_CONFIG.WEAPONS.HAND_POSE[WEAPON_POSE_KEYS[weapon]];

    if (isCrouching) {
      return {
        x: config.CROUCH.x * aimSign,
        y: config.CROUCH.y
      };
    }

    if (isRunning) {
      return {
        x: (config.STAND.x * aimSign) + ((config.RUN.x - config.STAND.x) * moveSign),
        y: config.RUN.y
      };
    }

    return {
      x: config.STAND.x * aimSign,
      y: config.STAND.y
    };
  }

  protected updateFistArmVisual(angle: number, weaponPose: PosePoint): void {
    const armConfig = GAME_CONFIG.WEAPONS.FIST_ARM;
    const visible = this.currentWeapon === 'fist' && !this.localGhost;

    this.fistArm.setVisible(visible);
    if (!visible) {
      return;
    }

    this.fistArm.setPosition(
      this.player.x + weaponPose.x + Math.cos(angle) * armConfig.OFFSET_X,
      this.player.y + weaponPose.y + armConfig.OFFSET_Y
    );
    this.fistArm.setRotation(angle);
    this.fistArm.setFillStyle(armConfig.FILL_COLOR, 1);
    this.fistArm.setStrokeStyle(armConfig.STROKE_WIDTH, armConfig.STROKE_COLOR, 1);
  }

  protected getCurrentWeaponPoseConfig(): typeof GAME_CONFIG.WEAPONS.HAND_POSE[WeaponPoseKey] {
    if (this.currentWeapon === 'fist') {
      return GAME_CONFIG.WEAPONS.HAND_POSE.PISTOL;
    }

    return GAME_CONFIG.WEAPONS.HAND_POSE[WEAPON_POSE_KEYS[this.currentWeapon]];
  }

  protected getHelmetPose(isCrouching: boolean, isRunning: boolean, moveSign: number): PosePoint {
    const currentFrame = this.playerVisual.anims.currentFrame;
    const frameIndex = currentFrame ? currentFrame.index : 0;

    return this.getHelmetPoseForFrame(isCrouching, isRunning, moveSign, frameIndex);
  }

  protected getHelmetPoseForFrame(isCrouching: boolean, isRunning: boolean, moveSign: number, frameIndex: number): PosePoint {
    const config = GAME_CONFIG.VISUALS.HELMET;

    if (isCrouching) {
      return {
        x: (config.CROUCH.x * moveSign) + (moveSign < 0 ? config.CROUCH_LEFT_CORRECTION_X : 0),
        y: config.CROUCH.y
      };
    }

    if (!isRunning) {
      return {
        x: (config.STAND.x * moveSign) + (moveSign < 0 ? config.STAND_LEFT_CORRECTION_X : 0),
        y: config.STAND.y
      };
    }

    const bobIndex = frameIndex % config.RUN_FRAME_BOB_Y.length;

    return {
      x: (config.RUN.x * moveSign) + (moveSign < 0 ? config.RUN_LEFT_CORRECTION_X : 0),
      y: config.RUN.y + config.RUN_FRAME_BOB_Y[bobIndex]
    };
  }
}
