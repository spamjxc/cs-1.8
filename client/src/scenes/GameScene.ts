import * as Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { ASSET_NAMES, ASSET_SPECS, GAME, GAME_CONFIG, MAP, TEAM, WEAPONS } from '@shared/constants';
import { MapBuilder } from '@client/entities/MapBuilder';
import { getPlayerSpawnY } from '@shared/utils/MapGeometry';
import { GameSceneData } from '@client/scenes/LobbyScene';
import { NetworkManager } from '@client/systems/NetworkManager';
import { Interpolator } from '@client/utils/Interpolator';
import { StatePredictor } from '@client/utils/StatePredictor';
import type { GameEventPayload, WeaponId } from '@shared/types/network';

type MovementKeys = {
  A: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  W: Phaser.Input.Keyboard.Key;
  SPACE: Phaser.Input.Keyboard.Key;
  CTRL: Phaser.Input.Keyboard.Key;
  ONE: Phaser.Input.Keyboard.Key;
  TWO: Phaser.Input.Keyboard.Key;
  THREE: Phaser.Input.Keyboard.Key;
  FOUR: Phaser.Input.Keyboard.Key;
};

type WeaponKind = WeaponId;
type WeaponPoseKey = 'PISTOL' | 'AUTO' | 'GRENADE' | 'RPG';
type PosePoint = {
  x: number;
  y: number;
};
type AimTarget = {
  worldX: number;
  worldY: number;
};

type RemotePlayerView = {
  body: Phaser.Physics.Arcade.Sprite;
  visual: Phaser.GameObjects.Sprite;
  weapon: Phaser.GameObjects.Sprite;
  fistArm: Phaser.GameObjects.Rectangle;
  helmet: Phaser.GameObjects.Sprite;
  name: Phaser.GameObjects.Text;
  hp?: Phaser.GameObjects.Text;
  interpolator: Interpolator;
  team: typeof TEAM.RED | typeof TEAM.BLUE;
  ghost: boolean;
  lastVx: number;
  weaponKind: WeaponKind;
  aimAngle: number;
};

const SPRITE_KEYS = {
  PLAYER_IDLE: 'player.idle',
  PLAYER_RUN: 'player.run',
  PLAYER_CROUCH: 'player.crouch',
  PLAYER_DAMAGE: 'player.damage',
  PLAYER_GHOST: 'player.ghost',
  FLOOR: 'tile.floor',
  BOX: 'cover.box',
  HELMET_RED: 'helmet.red',
  HELMET_BLUE: 'helmet.blue',
  WEAPON_PISTOL: 'weapon.pistol',
  WEAPON_AUTO: 'weapon.auto',
  WEAPON_GRENADE: 'weapon.grenade',
  WEAPON_RPG: 'weapon.rpg',
  PROJECTILE_BULLET: 'projectile.bullet',
  PROJECTILE_GRENADE: 'projectile.grenade',
  PROJECTILE_ROCKET: 'projectile.rocket',
  EXPLOSION: 'effect.explosion'
} as const;

const ANIMATION_KEYS = {
  PLAYER_RUN: 'player.run'
} as const;

const WEAPON_POSE_KEYS: Record<Exclude<WeaponKind, 'fist'>, WeaponPoseKey> = {
  pistol: 'PISTOL',
  auto: 'AUTO',
  grenade: 'GRENADE',
  rpg: 'RPG'
};

export default class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerVisual!: Phaser.GameObjects.Sprite;
  private fistArm!: Phaser.GameObjects.Rectangle;
  private weapon!: Phaser.GameObjects.Sprite;
  private helmet!: Phaser.GameObjects.Sprite;
  private playerName?: Phaser.GameObjects.Text;
  private hpText?: Phaser.GameObjects.Text;
  private ghostText?: Phaser.GameObjects.Text;
  private hudElement?: HTMLDivElement;
  private baseWarning?: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: MovementKeys;
  private groundGroup!: Phaser.Physics.Arcade.StaticGroup;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.StaticGroup;
  private explosions!: Phaser.GameObjects.Group;
  private readonly pickupSprites = new Map<string, Phaser.Physics.Arcade.Image>();
  private chargeBar!: Phaser.GameObjects.Graphics;
  private jumpsLeft = 2;
  private moveSpeed: number = GAME_CONFIG.PLAYER.MOVE_SPEED;
  private currentWeapon: WeaponKind = 'pistol';
  private currentAmmo: number = WEAPONS.PISTOL.ammo;
  private pickedDuringCurrentCrouch = false;
  private nextPickupAt = 0;
  private grenadeChargeStartedAt = 0;
  private isChargingGrenade = false;
  private isAutoFiring = false;
  private nextAutoShotAt = 0;
  private autoFireTarget?: AimTarget;
  private suppressInputUntil = 0;
  private nick = 'Player';
  private team: typeof TEAM.RED | typeof TEAM.BLUE = TEAM.RED;
  private room?: Room;
  private network?: NetworkManager;
  private readonly predictor = new StatePredictor();
  private readonly remotePlayers = new Map<string, RemotePlayerView>();
  private localHp = GAME.MAX_HP;
  private localGhost = false;
  private readonly windowMouseDownHandler = (event: MouseEvent): void => this.handleWindowMouseDown(event);
  private readonly windowMouseUpHandler = (event: MouseEvent): void => this.handleWindowMouseUp(event);
  private fistArmTween?: Phaser.Tweens.Tween;

  constructor() {
    super('GameScene');
  }

  init(data: GameSceneData): void {
    this.nick = data.nick || 'Player';
    this.team = data.team || TEAM.RED;
    this.room = data.room;
  }

  preload(): void {
    // Load tile assets
    this.load.image(SPRITE_KEYS.FLOOR, `assets/${ASSET_NAMES.TILE_FLOOR}`);
    this.load.image(SPRITE_KEYS.BOX, `assets/${ASSET_NAMES.TILE_WALL}`);
    
    // Load player sprites
    this.load.image(SPRITE_KEYS.PLAYER_IDLE, `assets/${ASSET_NAMES.PLAYER_IDLE}`);
    this.load.image(SPRITE_KEYS.PLAYER_CROUCH, `assets/${ASSET_NAMES.PLAYER_CROUCH}`);
    this.load.image(SPRITE_KEYS.PLAYER_DAMAGE, `assets/${ASSET_NAMES.PLAYER_DAMAGE}`);
    this.load.image(SPRITE_KEYS.PLAYER_GHOST, `assets/${ASSET_NAMES.PLAYER_GHOST}`);
    this.load.spritesheet(SPRITE_KEYS.PLAYER_RUN, `assets/${ASSET_NAMES.PLAYER_RUN}`, {
      frameWidth: ASSET_SPECS.PLAYER.RUN.frameWidth,
      frameHeight: ASSET_SPECS.PLAYER.RUN.frameHeight
    });
    
    // Load helmet assets
    this.load.image(SPRITE_KEYS.HELMET_RED, `assets/${ASSET_NAMES.HELMET_RED}`);
    this.load.image(SPRITE_KEYS.HELMET_BLUE, `assets/${ASSET_NAMES.HELMET_BLUE}`);

    // Load weapons and projectiles
    this.load.image(SPRITE_KEYS.WEAPON_PISTOL, `assets/${ASSET_NAMES.WEAPON_PISTOL}`);
    this.load.image(SPRITE_KEYS.WEAPON_AUTO, `assets/${ASSET_NAMES.WEAPON_AUTO}`);
    this.load.image(SPRITE_KEYS.WEAPON_GRENADE, `assets/${ASSET_NAMES.WEAPON_GRENADE}`);
    this.load.image(SPRITE_KEYS.WEAPON_RPG, `assets/${ASSET_NAMES.WEAPON_RPG}`);
    this.load.image(SPRITE_KEYS.PROJECTILE_BULLET, `assets/${ASSET_NAMES.PROJ_BULLET}`);
    this.load.image(SPRITE_KEYS.PROJECTILE_GRENADE, `assets/${ASSET_NAMES.PROJ_GRENADE}`);
    this.load.image(SPRITE_KEYS.PROJECTILE_ROCKET, `assets/${ASSET_NAMES.PROJ_ROCKET}`);
    this.load.image(SPRITE_KEYS.EXPLOSION, `assets/${ASSET_NAMES.EXPLOSION_01}`);
  }

  create(): void {
    if (!this.input.keyboard) {
      throw new Error('Keyboard input is not available');
    }

    this.physics.world.setBounds(0, 0, MAP.WIDTH, MAP.HEIGHT);
    this.cameras.main.setBounds(0, 0, MAP.WIDTH, MAP.HEIGHT);
    this.cameras.main.setZoom(GAME_CONFIG.CAMERA.ZOOM);
    this.addBaseZones();

    this.groundGroup = this.physics.add.staticGroup();
    new MapBuilder(this.groundGroup, {
      floor: SPRITE_KEYS.FLOOR,
      box: SPRITE_KEYS.BOX
    }).build(this.getMapSeed());
    
    // Create player sprite
    const spawnX = this.team === TEAM.RED ? MAP.RED_SPAWN_X : MAP.BLUE_SPAWN_X;
    this.player = this.physics.add.sprite(spawnX, getPlayerSpawnY(this.getMapSeed(), spawnX), SPRITE_KEYS.PLAYER_IDLE);
    this.player.setVisible(false);
    this.player.setCollideWorldBounds(false); // We use custom bounds with walls
    this.player.setBounce(0);
    this.player.setDragX(GAME_CONFIG.PLAYER.FRICTION);
    this.player.setData('crouching', false);
    this.playerVisual = this.add.sprite(this.player.x, this.player.y, SPRITE_KEYS.PLAYER_IDLE);
    
    // Add collider between player and ground
    this.physics.add.collider(this.player, this.groundGroup);

    this.helmet = this.add.sprite(this.player.x, this.player.y - 22, this.team === TEAM.RED ? SPRITE_KEYS.HELMET_RED : SPRITE_KEYS.HELMET_BLUE);
    this.playerName = this.add.text(this.player.x, this.player.y - 48, this.nick, {
      fontSize: '13px',
      color: '#e8f3d0',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5);
    this.hpText = this.add.text(16, 14, '', {
      fontSize: '16px',
      color: '#e8f3d0',
      fontFamily: 'Arial, sans-serif'
    }).setScrollFactor(0).setDepth(1000);
    this.ghostText = this.add.text(16, 38, '', {
      fontSize: '16px',
      color: '#f1d27a',
      fontFamily: 'Arial, sans-serif'
    }).setScrollFactor(0).setDepth(1000);
    this.baseWarning = this.add.rectangle(640, 360, 1280, 720, 0xff0000, 0)
      .setScrollFactor(0)
      .setDepth(9);

    this.weapon = this.add.sprite(this.player.x, this.player.y - 12, SPRITE_KEYS.WEAPON_PISTOL);
    this.fistArm = this.add.rectangle(
      this.player.x,
      this.player.y,
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
    this.setWeapon(this.currentWeapon);

    this.projectiles = this.physics.add.group({
      maxSize: 50,
      classType: Phaser.Physics.Arcade.Sprite,
      runChildUpdate: false
    });
    this.physics.add.collider(this.projectiles, this.groundGroup, this.handleProjectileCollision, undefined, this);

    this.pickups = this.physics.add.staticGroup();
    this.explosions = this.add.group({
      maxSize: 20,
      classType: Phaser.GameObjects.Sprite
    });

    this.chargeBar = this.add.graphics();
    
    // Create animations
    this.anims.create({
      key: ANIMATION_KEYS.PLAYER_RUN,
      frames: this.anims.generateFrameNumbers(SPRITE_KEYS.PLAYER_RUN, { start: 0, end: 9 }),
      frameRate: GAME_CONFIG.PLAYER.RUN_ANIMATION_FPS,
      repeat: -1
    });
    
    // Setup input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      A: Phaser.Input.Keyboard.KeyCodes.A,
      D: Phaser.Input.Keyboard.KeyCodes.D,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      W: Phaser.Input.Keyboard.KeyCodes.W,
      SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
      CTRL: Phaser.Input.Keyboard.KeyCodes.CTRL,
      ONE: Phaser.Input.Keyboard.KeyCodes.ONE,
      TWO: Phaser.Input.Keyboard.KeyCodes.TWO,
      THREE: Phaser.Input.Keyboard.KeyCodes.THREE,
      FOUR: Phaser.Input.Keyboard.KeyCodes.FOUR
    }) as MovementKeys;
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.installWindowMouseListeners();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeWindowMouseListeners, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyHudOverlay, this);
    this.createHudOverlay();
    this.setupNetwork();
    this.setupPickupStateSync();
    this.cameras.main.startFollow(
      this.playerVisual,
      GAME_CONFIG.CAMERA.ROUND_PIXELS,
      GAME_CONFIG.CAMERA.FOLLOW_LERP,
      GAME_CONFIG.CAMERA.FOLLOW_LERP
    );
    
    // Log asset loading
    console.log('Loaded asset config:', ASSET_NAMES.PLAYER_RUN);
    console.log('Game config:', GAME_CONFIG);
  }

  update(): void {
    this.updateRemotePlayers();
    this.updateHud();

    if (this.localGhost) {
      this.stopAutoFire();
      this.handleGhostMovement();
      this.updatePlayerVisual();
      this.applyGhostVisual(this.playerVisual, true);
      this.updateAttachedVisuals();
      this.updateNetworkInput();
      this.checkProjectileHits();
      this.recycleFarProjectiles();
      return;
    }

    this.handleWeaponHotkeys();
    this.handleCrouch();
    this.tryPickupWeapon();
    this.handleJump();
    this.applyJumpGravity();
    // Handle horizontal movement
    const moveLeft = this.keys.A.isDown || this.cursors.left.isDown;
    const moveRight = this.keys.D.isDown || this.cursors.right.isDown;
    
    let dir = 0;
    if (moveLeft) {
      dir = -1;
    } else if (moveRight) {
      dir = 1;
    }
    
    // Apply velocity
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(dir * this.moveSpeed);
    
    // Flip sprite based on direction
    if (dir === 1) {
      this.playerVisual.setFlipX(false);
    } else if (dir === -1) {
      this.playerVisual.setFlipX(true);
    }
    
    if (this.player.getData('crouching')) {
      this.playerVisual.anims.stop();
      this.playerVisual.setTexture(SPRITE_KEYS.PLAYER_IDLE);
    } else if (Math.abs(body.velocity.x) > 10) {
      this.playerVisual.anims.play(ANIMATION_KEYS.PLAYER_RUN, true);
    } else {
      this.playerVisual.anims.stop();
      this.playerVisual.setTexture(SPRITE_KEYS.PLAYER_IDLE);
    }

    this.updatePlayerVisual();
    this.updateAttachedVisuals();
    this.updateChargeBar();
    this.updateAutoFire();
    this.updateNetworkInput();
    this.checkProjectileHits();
    this.recycleFarProjectiles();
  }

  private addBaseZones(): void {
    this.add.rectangle(MAP.BASE_WIDTH / 2, MAP.HEIGHT / 2, MAP.BASE_WIDTH, MAP.HEIGHT, 0x8a2f2f, 0.24).setDepth(-1);
    this.add.rectangle(MAP.WIDTH - MAP.BASE_WIDTH / 2, MAP.HEIGHT / 2, MAP.BASE_WIDTH, MAP.HEIGHT, 0x2f568a, 0.24).setDepth(-1);
  }

  private setupNetwork(): void {
    if (!this.room) {
      return;
    }

    this.network = new NetworkManager(this.room);
    this.network.onPlayer((player, id) => this.syncNetworkPlayer(player, id));
    this.network.onPlayerRemove((id) => this.removeRemotePlayer(id));
    this.network.onEvent((event) => this.handleNetworkEvent(event));
    this.network.start();
  }

  private setupPickupStateSync(): void {
    const pickups = (this.room?.state as any)?.pickups;
    if (!pickups) {
      return;
    }

    pickups.forEach((pickup: any, id: string) => this.syncPickup(pickup, id));
    pickups.onAdd = (pickup: any, id: string) => this.syncPickup(pickup, id);
    pickups.onRemove = (_pickup: any, id: string) => this.removePickup(id);
  }

  private syncPickup(pickup: any, id: string): void {
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
    sprite.setPosition(Number(pickup.x) || 0, Number(pickup.y) || 0);
    sprite.setData('ammo', Number(pickup.ammo) || 0);
    sprite.refreshBody();
  }

  private removePickup(id: string): void {
    const sprite = this.pickupSprites.get(id);
    if (!sprite) {
      return;
    }

    sprite.destroy();
    this.pickupSprites.delete(id);
  }

  private updateNetworkInput(): void {
    if (!this.network || this.time.now < this.suppressInputUntil) {
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

  private syncNetworkPlayer(player: any, id: string): void {
    if (this.network && id === this.network.getSessionId()) {
      this.localHp = player.hp;
      this.localGhost = Boolean(player.ghost);
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
    remote.weaponKind = this.normalizeWeapon(player.weapon);
    remote.aimAngle = Number(player.aimAngle) || 0;
    remote.interpolator.push({
      tick: Number(player.lastInputTick) || 0,
      x: Number(player.x) || 0,
      y: Number(player.y) || 0,
      vx: Number(player.vx) || 0,
      vy: Number(player.vy) || 0
    });
    remote.helmet.setTexture(player.team === TEAM.RED ? SPRITE_KEYS.HELMET_RED : SPRITE_KEYS.HELMET_BLUE);
    remote.name.setText(player.nick || 'Player');
    remote.hp?.setText(player.team === this.team ? `${Math.ceil(player.hp)} HP` : '');
    this.applyGhostVisual(remote.visual, Boolean(player.ghost));
    this.updateRemoteWeaponTexture(remote);
  }

  private createRemotePlayer(player: any, id: string): RemotePlayerView {
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
      lastVx: Number(player.vx) || 0,
      weaponKind,
      aimAngle: Number(player.aimAngle) || 0
    };
  }

  private updateRemotePlayers(): void {
    this.remotePlayers.forEach((remote) => {
      const sample = remote.interpolator.update();
      if (sample) {
        remote.body.setPosition(sample.x, sample.y);
        remote.visual.setPosition(sample.x, sample.y);
        remote.lastVx = sample.vx;
      }

      this.updateRemoteRunAnimation(remote);
      this.updateRemoteWeaponVisual(remote);

      const helmetPose = GAME_CONFIG.VISUALS.HELMET.STAND;
      remote.helmet.setPosition(remote.visual.x + helmetPose.x, remote.visual.y + helmetPose.y);
      remote.name.setPosition(remote.helmet.x, remote.helmet.y + GAME_CONFIG.VISUALS.HELMET.NAME_OFFSET_Y);
      remote.hp?.setPosition(remote.helmet.x, remote.helmet.y + GAME_CONFIG.VISUALS.HELMET.NAME_OFFSET_Y - 14);
    });
  }

  private updateRemoteRunAnimation(remote: RemotePlayerView): void {
    if (remote.ghost) {
      this.applyGhostVisual(remote.visual, true);
      return;
    }

    if (Math.abs(remote.lastVx) > 10) {
      remote.visual.setTexture(SPRITE_KEYS.PLAYER_RUN);
      remote.visual.anims.play(ANIMATION_KEYS.PLAYER_RUN, true);
      remote.visual.setFlipX(remote.lastVx < 0);
    } else {
      remote.visual.anims.stop();
      remote.visual.setTexture(SPRITE_KEYS.PLAYER_IDLE);
    }
  }

  private updateRemoteWeaponTexture(remote: RemotePlayerView): void {
    if (remote.weaponKind === 'fist') {
      remote.weapon.setVisible(false);
      return;
    }

    remote.weapon.setTexture(this.getWeaponTexture(remote.weaponKind));
    const poseConfig = GAME_CONFIG.WEAPONS.HAND_POSE[WEAPON_POSE_KEYS[remote.weaponKind]];
    remote.weapon.setOrigin(poseConfig.ORIGIN_X, 0.5);
    remote.weapon.setScale(poseConfig.DISPLAY_SCALE);
  }

  private updateRemoteWeaponVisual(remote: RemotePlayerView): void {
    const hidden = remote.ghost;
    const isFist = remote.weaponKind === 'fist';
    const angle = remote.aimAngle;
    const aimSign = Math.cos(angle) < 0 ? -1 : 1;
    const isRunning = !remote.ghost && Math.abs(remote.lastVx) > 10;
    const moveSign = remote.lastVx < -10 ? -1 : 1;
    const pose = this.getWeaponPoseForKind(remote.weaponKind, false, isRunning, aimSign, moveSign);

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

  private removeRemotePlayer(id: string): void {
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

  private applyLocalServerState(player: any): void {
    this.predictor.correct(this.player, Number(player.x) || this.player.x, Number(player.y) || this.player.y);
    this.applyGhostVisual(this.playerVisual, Boolean(player.ghost));
    this.player.setData('ghost', Boolean(player.ghost));

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(!player.ghost);
    body.checkCollision.none = Boolean(player.ghost);
  }

  private handleNetworkEvent(event: GameEventPayload): void {
    if (event.type === 'explode') {
      this.spawnExplosion(event.x || 0, event.y || 0);
      this.applyExplosionKnockback(event.x || 0, event.y || 0, event.radius || 0, event.knockback || 0);
      return;
    }

    if (this.network && event.targetId === this.network.getSessionId()) {
      if (event.type === 'respawn') {
        this.snapLocalToServerState(event);
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
        remote.body.setPosition(event.x ?? fallbackX, event.y ?? getPlayerSpawnY(this.getMapSeed(), fallbackX));
        remote.visual.setPosition(remote.body.x, remote.body.y);
      } else if ((event.type === 'pickup' || event.type === 'ammo') && event.weapon) {
        remote.weaponKind = event.weapon;
        this.updateRemoteWeaponTexture(remote);
      } else if (event.type === 'hit' || event.type === 'baseDamage' || event.type === 'death') {
        this.flashDamage(remote.visual, remote.ghost);
      }
    }
  }

  private snapLocalToServerState(event: GameEventPayload): void {
    const state = this.room?.state as any;
    const player = state?.players?.get ? state.players.get(this.network?.getSessionId()) : undefined;
    const x = event.x ?? Number(player?.x);
    const y = event.y ?? Number(player?.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    this.player.setPosition(x, y);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.suppressInputUntil = this.time.now + 250;
  }

  private updateHud(): void {
    const inEnemyBase = this.isLocalInEnemyBase();
    const baseWarningConfig = GAME_CONFIG.BASES;
    const baseWarningRange = baseWarningConfig.DAMAGE_WARNING_MAX_ALPHA - baseWarningConfig.DAMAGE_WARNING_MIN_ALPHA;
    const baseWarningPulse = (Math.sin(this.time.now / baseWarningConfig.DAMAGE_WARNING_BLINK_MS) + 1) / 2;

    this.hpText?.setText(`HP ${Math.ceil(this.localHp)} | ${this.getWeaponLabel()} ${this.getAmmoLabel()}`);
    this.ghostText?.setText(this.localGhost ? `Призрак ${Math.ceil(this.getLocalGhostTimer())}s` : '');
    this.updateHudOverlay();
    this.baseWarning?.setAlpha(inEnemyBase && !this.localGhost
      ? baseWarningConfig.DAMAGE_WARNING_MIN_ALPHA + baseWarningPulse * baseWarningRange
      : 0);
  }

  private createHudOverlay(): void {
    const container = document.getElementById('game-container');
    if (!container) {
      return;
    }

    this.hudElement = document.createElement('div');
    this.hudElement.style.position = 'absolute';
    this.hudElement.style.left = '12px';
    this.hudElement.style.top = '12px';
    this.hudElement.style.zIndex = '20';
    this.hudElement.style.pointerEvents = 'none';
    this.hudElement.style.padding = '7px 10px';
    this.hudElement.style.border = '1px solid rgba(232, 243, 208, 0.35)';
    this.hudElement.style.background = 'rgba(8, 12, 9, 0.72)';
    this.hudElement.style.color = '#e8f3d0';
    this.hudElement.style.font = '700 14px Arial, sans-serif';
    this.hudElement.style.lineHeight = '18px';
    this.hudElement.style.textShadow = '0 1px 1px #000';
    container.appendChild(this.hudElement);
    this.updateHudOverlay();
  }

  private updateHudOverlay(): void {
    if (!this.hudElement) {
      return;
    }

    const ghostLine = this.localGhost ? `<div style="color:#f1d27a">Призрак ${Math.ceil(this.getLocalGhostTimer())}s</div>` : '';
    this.hudElement.innerHTML = [
      `<div>HP ${Math.ceil(this.localHp)}</div>`,
      `<div>${this.getWeaponLabel()} ${this.getAmmoLabel()}</div>`,
      ghostLine
    ].join('');
  }

  private destroyHudOverlay(): void {
    this.hudElement?.remove();
    this.hudElement = undefined;
  }

  private getLocalGhostTimer(): number {
    const state = this.room?.state as any;
    const player = state?.players?.get ? state.players.get(this.network?.getSessionId()) : undefined;
    return Number(player?.ghostTimer) || 0;
  }

  private isLocalInEnemyBase(): boolean {
    return (this.team === TEAM.BLUE && this.player.x < MAP.BASE_WIDTH) ||
      (this.team === TEAM.RED && this.player.x > MAP.WIDTH - MAP.BASE_WIDTH);
  }

  private getMapSeed(): number {
    const state = this.room?.state as any;
    return Number(state?.mapSeed) || MAP.DEFAULT_SEED;
  }

  private syncLocalWeapon(player: any): void {
    const weapon = this.normalizeWeapon(player.weapon);
    const ammo = Number(player.ammo);

    if (weapon !== this.currentWeapon) {
      this.setWeapon(weapon);
    }

    if (Number.isFinite(ammo)) {
      this.currentAmmo = ammo;
    }
  }

  private normalizeWeapon(weapon: unknown): WeaponKind {
    return weapon === 'fist' || weapon === 'auto' || weapon === 'grenade' || weapon === 'rpg' || weapon === 'pistol'
      ? weapon
      : 'pistol';
  }

  private getWeaponTexture(weapon: Exclude<WeaponKind, 'fist'>): string {
    const textureByWeapon: Record<Exclude<WeaponKind, 'fist'>, string> = {
      pistol: SPRITE_KEYS.WEAPON_PISTOL,
      auto: SPRITE_KEYS.WEAPON_AUTO,
      grenade: SPRITE_KEYS.WEAPON_GRENADE,
      rpg: SPRITE_KEYS.WEAPON_RPG
    };

    return textureByWeapon[weapon];
  }

  private getWeaponLabel(): string {
    const labels: Record<WeaponKind, string> = {
      fist: 'Fist',
      pistol: 'Pistol',
      auto: 'SMG',
      grenade: 'Grenade',
      rpg: 'RPG'
    };

    return labels[this.currentWeapon];
  }

  private getAmmoLabel(): string {
    return this.currentWeapon === 'fist' || this.currentAmmo < 0 ? '∞' : String(this.currentAmmo);
  }

  private tryPickupWeapon(): void {
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

  private spawnExplosion(x: number, y: number): void {
    const explosion = this.explosions.get(x, y, SPRITE_KEYS.EXPLOSION) as Phaser.GameObjects.Sprite | null;
    if (!explosion) {
      return;
    }

    explosion.setActive(true).setVisible(true).setPosition(x, y);
    explosion.setScale(ASSET_SPECS.EFFECT.EXPLOSION.startScale);
    explosion.setAlpha(0.9);
    explosion.setDepth(5);

    this.tweens.add({
      targets: explosion,
      scale: ASSET_SPECS.EFFECT.EXPLOSION.endScale,
      alpha: 0,
      duration: ASSET_SPECS.EFFECT.EXPLOSION.durationMs,
      onComplete: () => {
        explosion.setActive(false).setVisible(false);
      }
    });
  }

  private applyExplosionKnockback(x: number, y: number, radius: number, maxKnockback: number): void {
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

  private handleGhostMovement(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const moveLeft = this.keys.A.isDown || this.cursors.left.isDown;
    const moveRight = this.keys.D.isDown || this.cursors.right.isDown;
    const moveUp = this.keys.W.isDown || this.keys.SPACE.isDown || this.cursors.up.isDown;
    const moveDown = this.keys.S.isDown || this.cursors.down.isDown;
    const x = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
    const y = (moveDown ? 1 : 0) - (moveUp ? 1 : 0);

    body.setVelocity(x * GAME_CONFIG.PLAYER.GHOST_MOVE_SPEED, y * GAME_CONFIG.PLAYER.GHOST_MOVE_SPEED);
    body.setAllowGravity(false);
    this.isChargingGrenade = false;
    this.chargeBar.clear();
  }

  private applyGhostVisual(sprite: Phaser.GameObjects.Sprite, ghost: boolean): void {
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

  private flashDamage(sprite: Phaser.GameObjects.Sprite, ghost: boolean): void {
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

  private handleJump(): void {
    if (this.localGhost) {
      return;
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.keys.W) ||
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up);

    if (body.touching.down || body.blocked.down) {
      this.jumpsLeft = 2;
    }

    if (jumpPressed && this.jumpsLeft > 0) {
      const force = this.jumpsLeft === 2 ? GAME_CONFIG.PLAYER.JUMP_FORCE : GAME_CONFIG.PLAYER.DOUBLE_JUMP_FORCE;
      body.setVelocityY(force);
      this.jumpsLeft--;
    }
  }

  private applyJumpGravity(): void {
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

  private handleCrouch(): void {
    const isCrouching = this.keys.CTRL.isDown || this.keys.S.isDown || this.cursors.down.isDown;

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

  private updatePlayerVisual(): void {
    const isCrouching = Boolean(this.player.getData('crouching'));
    const scaleY = isCrouching ? GAME_CONFIG.PLAYER.CROUCH_VISUAL_SCALE_Y : 1;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const feetY = body.bottom;
    const visualHeight = ASSET_SPECS.PLAYER.IDLE.height * scaleY;

    this.playerVisual.setScale(1, scaleY);
    this.playerVisual.setPosition(this.player.x, feetY - visualHeight / 2);
    this.playerVisual.setDepth(1);
  }

  private updateAttachedVisuals(): void {
    const pointer = this.input.activePointer;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const isCrouching = Boolean(this.player.getData('crouching'));
    const isRunning = !this.localGhost && !isCrouching && Math.abs(body.velocity.x) > 10;
    const moveSign = body.velocity.x < -10 ? -1 : 1;
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y - 8, pointer.worldX, pointer.worldY);
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

  private getWeaponPose(isCrouching: boolean, isRunning: boolean, aimSign: number, moveSign: number): PosePoint {
    return this.getWeaponPoseForKind(this.currentWeapon, isCrouching, isRunning, aimSign, moveSign);
  }

  private getWeaponPoseForKind(weapon: WeaponKind, isCrouching: boolean, isRunning: boolean, aimSign: number, moveSign: number): PosePoint {
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

  private updateFistArmVisual(angle: number, weaponPose: PosePoint): void {
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

  private getCurrentWeaponPoseConfig(): typeof GAME_CONFIG.WEAPONS.HAND_POSE[WeaponPoseKey] {
    if (this.currentWeapon === 'fist') {
      return GAME_CONFIG.WEAPONS.HAND_POSE.PISTOL;
    }

    return GAME_CONFIG.WEAPONS.HAND_POSE[WEAPON_POSE_KEYS[this.currentWeapon]];
  }

  private getHelmetPose(isCrouching: boolean, isRunning: boolean, moveSign: number): PosePoint {
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

    const currentFrame = this.playerVisual.anims.currentFrame;
    const frameIndex = currentFrame ? currentFrame.index % config.RUN_FRAME_BOB_Y.length : 0;

    return {
      x: (config.RUN.x * moveSign) + (moveSign < 0 ? config.RUN_LEFT_CORRECTION_X : 0),
      y: config.RUN.y + config.RUN_FRAME_BOB_Y[frameIndex]
    };
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
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

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
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

  private installWindowMouseListeners(): void {
    window.addEventListener('mousedown', this.windowMouseDownHandler);
    window.addEventListener('mouseup', this.windowMouseUpHandler);
  }

  private removeWindowMouseListeners(): void {
    window.removeEventListener('mousedown', this.windowMouseDownHandler);
    window.removeEventListener('mouseup', this.windowMouseUpHandler);
  }

  private handleWindowMouseDown(event: MouseEvent): void {
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

  private handleWindowMouseUp(event: MouseEvent): void {
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

  private getWorldTargetFromWindowEvent(event: MouseEvent): AimTarget {
    const rect = this.game.canvas.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * (this.scale.width / rect.width);
    const screenY = (event.clientY - rect.top) * (this.scale.height / rect.height);
    const worldPoint = this.cameras.main.getWorldPoint(screenX, screenY);

    return {
      worldX: worldPoint.x,
      worldY: worldPoint.y
    };
  }

  private startAutoFire(target: AimTarget): void {
    this.isChargingGrenade = false;
    this.chargeBar.clear();
    this.isAutoFiring = true;
    this.autoFireTarget = target;
    this.fireDirectProjectile(target);
    this.nextAutoShotAt = this.time.now + this.getAutoFireIntervalMs();
  }

  private stopAutoFire(): void {
    this.isAutoFiring = false;
    this.autoFireTarget = undefined;
  }

  private updateAutoFire(): void {
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

  private getAutoFireIntervalMs(): number {
    return 1000 / GAME_CONFIG.WEAPONS.DIRECT_PROJECTILE.AUTO_FIRE_RATE_PER_SEC;
  }

  private fireDirectProjectile(target: AimTarget): void {
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

  private throwGrenade(target: AimTarget): void {
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

  private getDirectProjectileConfig(weapon: WeaponKind = this.currentWeapon): { speed: number; damage: number } {
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

  private swingFist(): void {
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

  private playFistArmAttack(): void {
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

  private consumeLocalAmmo(): boolean {
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

  private resizeProjectileBody(projectile: Phaser.Physics.Arcade.Sprite): void {
    const body = projectile.body as Phaser.Physics.Arcade.Body;
    body.setSize(projectile.width || 12, projectile.height || 5);
  }

  private obtainProjectile(): Phaser.Physics.Arcade.Sprite | undefined {
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

  private checkProjectileHits(): void {
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

  private handleProjectileCollision(projectileObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile): void {
    if (projectileObject instanceof Phaser.Tilemaps.Tile) {
      return;
    }

    const projectile = projectileObject as Phaser.Physics.Arcade.Sprite;
    this.triggerProjectileExplosion(projectile);
    this.disableProjectile(projectile);
  }

  private handleProjectilePlayerOverlap(
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

  private triggerProjectileExplosion(projectile: Phaser.Physics.Arcade.Sprite, x: number = projectile.x, y: number = projectile.y): void {
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

  private disableProjectile(projectileObject: Phaser.GameObjects.GameObject): void {
    const projectile = projectileObject as Phaser.Physics.Arcade.Sprite;
    const body = projectile.body as Phaser.Physics.Arcade.Body;

    body.stop();
    body.enable = false;
    projectile.setActive(false);
    projectile.setVisible(false);
  }

  private recycleFarProjectiles(): void {
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

  private updateChargeBar(): void {
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

  private getGrenadeChargeRatio(): number {
    const elapsed = this.time.now - this.grenadeChargeStartedAt;
    return Phaser.Math.Clamp(elapsed / GAME_CONFIG.WEAPONS.GRENADE_THROW.CHARGE_TIME_MS, 0, 1);
  }

  private handleWeaponHotkeys(): void {
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

  private setWeapon(weapon: WeaponKind): void {
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
