import * as Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { ASSET_NAMES, ASSET_SPECS, GAME, GAME_CONFIG, MAP, TEAM, Theme, THEME, WEAPONS } from '@shared/constants';
import { MapBuilder } from '@client/entities/MapBuilder';
import { getPlayerSpawnY } from '@shared/utils/MapGeometry';
import { GameSceneData } from '@client/scenes/LobbyScene';
import { NetworkManager } from '@client/systems/NetworkManager';
import { StatePredictor } from '@client/utils/StatePredictor';
import type { AdminCommandType, MatchPhase, StatsPacket } from '@shared/types/network';
import { GameSceneProjectiles } from '@client/scenes/game/GameSceneProjectiles';
import { ANIMATION_KEYS, SPRITE_KEYS, type AimTarget, type MovementKeys, type RemotePlayerView, type WeaponKind } from '@client/scenes/game/GameSceneConfig';

export default class GameScene extends GameSceneProjectiles {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerVisual!: Phaser.GameObjects.Sprite;
  private fistArm!: Phaser.GameObjects.Rectangle;
  private weapon!: Phaser.GameObjects.Sprite;
  private helmet!: Phaser.GameObjects.Sprite;
  private playerName?: Phaser.GameObjects.Text;
  private hpText?: Phaser.GameObjects.Text;
  private ghostText?: Phaser.GameObjects.Text;
  private hudElement?: HTMLDivElement;
  private timerElement?: HTMLDivElement;
  private statsElement?: HTMLDivElement;
  private adminElement?: HTMLDivElement;
  private adminModalElement?: HTMLDivElement;
  private chatElement?: HTMLDivElement;
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
  private phase: MatchPhase = 'lobby';
  private phaseTimer = 0;
  private redScore = 0;
  private blueScore = 0;
  private autoBalance = false;
  private isAdmin = false;
  private adminModalOpen = false;
  private pendingAdminCommand?: AdminCommandType;
  private pendingAdminButton?: HTMLButtonElement;
  private lastStats?: StatsPacket;
  private currentMapSeed: number = MAP.DEFAULT_SEED;
  private currentTheme: Theme = THEME.CAVE;
  private readonly chatMessages: string[] = [];
  private readonly windowMouseDownHandler = (event: MouseEvent): void => this.handleWindowMouseDown(event);
  private readonly windowMouseUpHandler = (event: MouseEvent): void => this.handleWindowMouseUp(event);
  private readonly resizeHandler = (): void => {
    this.configureCamera();
    this.refreshMobileControlsMode();
    this.applyHudResponsiveLayout();
    this.applyAdminResponsiveLayout();
  };
  private fistArmTween?: Phaser.Tweens.Tween;
  private hasReceivedLocalState = false;
  private mobileControlsEnabled = false;
  private mobileMovePointerId?: number;
  private mobileFirePointerId?: number;
  private mobileStickBase = new Phaser.Math.Vector2(0, 0);
  private mobileStickKnob = new Phaser.Math.Vector2(0, 0);
  private mobileMoveVector = new Phaser.Math.Vector2(0, 0);
  private mobileStickGraphics?: Phaser.GameObjects.Graphics;
  private mobileFireGraphics?: Phaser.GameObjects.Graphics;
  private mobileJumpQueued = false;
  private mobileUpHeld = false;
  private mobileNextHeldJumpAt = 0;
  private mobileAimTarget?: AimTarget;
  private lastAimTarget?: AimTarget;

  constructor() {
    super('GameScene');
  }

  init(data: GameSceneData): void {
    this.nick = data.nick || 'Player';
    this.team = data.team || TEAM.RED;
    this.room = data.room;
    this.hasReceivedLocalState = false;
  }

  preload(): void {
    // Load tile assets
    Object.values(THEME).map((theme) => ({ theme, themePath: `assets/theme/${theme}` })).forEach(({ theme, themePath}) => {
      this.load.image(`theme.${theme}.floor`, `${themePath}/${ASSET_NAMES.TILE_FLOOR}`);
      this.load.image(`theme.${theme}.box`, `${themePath}/${ASSET_NAMES.TILE_WALL}`);
      this.load.image(`theme.${theme}.ceil`, `${themePath}/${ASSET_NAMES.TILE_CEIL}`);
      this.load.image(`theme.${theme}.bound`, `${themePath}/${ASSET_NAMES.TILE_BOUND}`);
    });
    
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
    this.configureCamera();
    this.addBaseZones();

    this.groundGroup = this.physics.add.staticGroup();
    this.currentMapSeed = this.getMapSeed();
    this.currentTheme = this.getMapTheme();

    this.setThemeBackground(this.currentTheme);

    new MapBuilder(this.groundGroup, {
      floor: `theme.${this.currentTheme}.floor`,
      box: `theme.${this.currentTheme}.box`,
      ceil: `theme.${this.currentTheme}.ceil`,
      bound: `theme.${this.currentTheme}.bound`,
    }).build(this.currentMapSeed);
    
    // Create player sprite
    const initialPlayer = this.getInitialLocalPlayerState();
    if (initialPlayer) {
      this.team = initialPlayer.team === TEAM.BLUE ? TEAM.BLUE : TEAM.RED;
    }
    const spawnX = this.getInitialSpawnX(initialPlayer);
    const spawnY = this.getInitialSpawnY(initialPlayer, spawnX);
    this.player = this.physics.add.sprite(spawnX, spawnY, SPRITE_KEYS.PLAYER_IDLE);
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
    this.baseWarning = this.add.rectangle(
      (this.scale.width || 1280) / 2,
      (this.scale.height || 720) / 2,
      this.scale.width || 1280,
      this.scale.height || 720,
      0xff0000,
      0
    )
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
    this.physics.add.overlap(this.projectiles, this.player, this.handleProjectileLocalOverlap, undefined, this);

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
    this.input.on('pointermove', this.handlePointerMove, this);
    this.installWindowMouseListeners();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeWindowMouseListeners, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.handlePointerDown, this);
      this.input.off('pointerup', this.handlePointerUp, this);
      this.input.off('pointermove', this.handlePointerMove, this);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyHudOverlay, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyMobileControls, this);
    this.scale.on('resize', this.resizeHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.resizeHandler));
    this.createHudOverlay();
    this.createStatsOverlay();
    this.createAdminPanel();
    this.createChatOverlay();
    this.createMobileControls();
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
    this.syncMatchState();
    this.updateRemotePlayers();
    this.updateHud();
    this.updateMobileControls();

    if (this.adminModalOpen) {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      body.setVelocityX(0);
      this.stopAutoFire();
      this.chargeBar?.clear();
      this.updatePlayerVisual();
      this.updateAttachedVisuals();
      this.checkProjectileHits();
      this.recycleFarProjectiles();
      return;
    }

    if (this.phase !== 'fight') {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      body.setAllowGravity(false);
      this.stopAutoFire();
      this.chargeBar?.clear();
      this.updatePlayerVisual();
      this.updateAttachedVisuals();
      this.checkProjectileHits();
      this.recycleFarProjectiles();
      return;
    }

    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(!this.localGhost);

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
    const dir = this.getHorizontalMoveDirection();
    
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

  private getInitialLocalPlayerState(): any | undefined {
    const players = (this.room?.state as any)?.players;
    return players && players.get ? players.get(this.room?.sessionId) : undefined;
  }

  private getInitialSpawnX(player: any | undefined): number {
    const x = Number(player?.x);
    if (Number.isFinite(x)) {
      return x;
    }

    return this.team === TEAM.RED ? MAP.RED_SPAWN_X : MAP.BLUE_SPAWN_X;
  }

  private getInitialSpawnY(player: any | undefined, spawnX: number): number {
    const y = Number(player?.y);
    if (Number.isFinite(y)) {
      return y;
    }

    return getPlayerSpawnY(this.getMapSeed(), spawnX);
  }
}
