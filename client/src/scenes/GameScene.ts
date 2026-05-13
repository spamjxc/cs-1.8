import * as Phaser from 'phaser';
import { ASSET_NAMES, ASSET_SPECS, GAME_CONFIG, TEAM } from '@shared/constants';
import { GameSceneData } from '@client/scenes/LobbyScene';

type MovementKeys = {
  A: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
  W: Phaser.Input.Keyboard.Key;
  SPACE: Phaser.Input.Keyboard.Key;
  CTRL: Phaser.Input.Keyboard.Key;
  ONE: Phaser.Input.Keyboard.Key;
  TWO: Phaser.Input.Keyboard.Key;
  THREE: Phaser.Input.Keyboard.Key;
  FOUR: Phaser.Input.Keyboard.Key;
};

type WeaponKind = 'pistol' | 'auto' | 'grenade' | 'rpg';
type WeaponPoseKey = 'PISTOL' | 'AUTO' | 'GRENADE' | 'RPG';
type PosePoint = {
  x: number;
  y: number;
};
type AimTarget = {
  worldX: number;
  worldY: number;
};

const SPRITE_KEYS = {
  PLAYER_IDLE: 'player.idle',
  PLAYER_RUN: 'player.run',
  PLAYER_CROUCH: 'player.crouch',
  FLOOR: 'tile.floor',
  WALL: 'tile.wall',
  HELMET_RED: 'helmet.red',
  HELMET_BLUE: 'helmet.blue',
  WEAPON_PISTOL: 'weapon.pistol',
  WEAPON_AUTO: 'weapon.auto',
  WEAPON_GRENADE: 'weapon.grenade',
  WEAPON_RPG: 'weapon.rpg',
  PROJECTILE_BULLET: 'projectile.bullet',
  PROJECTILE_GRENADE: 'projectile.grenade',
  PROJECTILE_ROCKET: 'projectile.rocket'
} as const;

const ANIMATION_KEYS = {
  PLAYER_RUN: 'player.run'
} as const;

const WEAPON_POSE_KEYS: Record<WeaponKind, WeaponPoseKey> = {
  pistol: 'PISTOL',
  auto: 'AUTO',
  grenade: 'GRENADE',
  rpg: 'RPG'
};

export default class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private weapon!: Phaser.GameObjects.Sprite;
  private helmet!: Phaser.GameObjects.Sprite;
  private playerName?: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: MovementKeys;
  private groundGroup!: Phaser.Physics.Arcade.StaticGroup;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private chargeBar!: Phaser.GameObjects.Graphics;
  private jumpsLeft = 2;
  private moveSpeed: number = GAME_CONFIG.PLAYER.MOVE_SPEED;
  private currentWeapon: WeaponKind = 'pistol';
  private grenadeChargeStartedAt = 0;
  private isChargingGrenade = false;
  private nick = 'Player';
  private team: typeof TEAM.RED | typeof TEAM.BLUE = TEAM.RED;
  private readonly windowMouseDownHandler = (event: MouseEvent): void => this.handleWindowMouseDown(event);
  private readonly windowMouseUpHandler = (event: MouseEvent): void => this.handleWindowMouseUp(event);

  constructor() {
    super('GameScene');
  }

  init(data: GameSceneData): void {
    this.nick = data.nick || 'Player';
    this.team = data.team || TEAM.RED;
  }

  preload(): void {
    // Load tile assets
    this.load.image(SPRITE_KEYS.FLOOR, `assets/${ASSET_NAMES.TILE_FLOOR}`);
    this.load.image(SPRITE_KEYS.WALL, `assets/${ASSET_NAMES.TILE_WALL}`);
    
    // Load player sprites
    this.load.image(SPRITE_KEYS.PLAYER_IDLE, `assets/${ASSET_NAMES.PLAYER_IDLE}`);
    this.load.image(SPRITE_KEYS.PLAYER_CROUCH, `assets/${ASSET_NAMES.PLAYER_CROUCH}`);
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
  }

  create(): void {
    if (!this.input.keyboard) {
      throw new Error('Keyboard input is not available');
    }

    // Create ground/platforms using tile_ground.png
    this.groundGroup = this.physics.add.staticGroup();
    
    // Create a series of ground tiles at the bottom
    for (let i = 0; i < 40; i++) {
      const ground = this.groundGroup.create(i * 64, 680, SPRITE_KEYS.FLOOR) as Phaser.Physics.Arcade.Image;
      ground.setDisplaySize(64, 64);
      ground.refreshBody();
    }
    
    // Create some platforms
    for (let i = 5; i < 15; i++) {
      const platform = this.groundGroup.create(i * 64, 500, SPRITE_KEYS.FLOOR) as Phaser.Physics.Arcade.Image;
      platform.setDisplaySize(64, 64);
      platform.refreshBody();
    }
    
    for (let i = 20; i < 30; i++) {
      const platform = this.groundGroup.create(i * 64, 400, SPRITE_KEYS.FLOOR) as Phaser.Physics.Arcade.Image;
      platform.setDisplaySize(64, 64);
      platform.refreshBody();
    }
    
    // Create walls on the sides
    for (let i = 0; i < 12; i++) {
      const leftWall = this.groundGroup.create(-32, i * 60, SPRITE_KEYS.WALL) as Phaser.Physics.Arcade.Image;
      leftWall.setDisplaySize(64, 64);
      leftWall.refreshBody();
      
      const rightWall = this.groundGroup.create(40 * 64 + 32, i * 60, SPRITE_KEYS.WALL) as Phaser.Physics.Arcade.Image;
      rightWall.setDisplaySize(64, 64);
      rightWall.refreshBody();
    }
    
    // Create ceiling
    for (let i = 0; i < 40; i++) {
      const ceiling = this.groundGroup.create(i * 64, -32, SPRITE_KEYS.WALL) as Phaser.Physics.Arcade.Image;
      ceiling.setDisplaySize(64, 64);
      ceiling.refreshBody();
    }
    
    // Create player sprite
    this.player = this.physics.add.sprite(200, 600, SPRITE_KEYS.PLAYER_IDLE);
    this.player.setCollideWorldBounds(false); // We use custom bounds with walls
    this.player.setBounce(0);
    this.player.setDragX(GAME_CONFIG.PLAYER.FRICTION);
    this.player.setData('crouching', false);
    
    // Add collider between player and ground
    this.physics.add.collider(this.player, this.groundGroup);

    this.helmet = this.add.sprite(this.player.x, this.player.y - 22, this.team === TEAM.RED ? SPRITE_KEYS.HELMET_RED : SPRITE_KEYS.HELMET_BLUE);
    this.playerName = this.add.text(this.player.x, this.player.y - 48, this.nick, {
      fontSize: '13px',
      color: '#e8f3d0',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5);

    this.weapon = this.add.sprite(this.player.x, this.player.y - 12, SPRITE_KEYS.WEAPON_PISTOL);
    this.setWeapon(this.currentWeapon);

    this.projectiles = this.physics.add.group({
      maxSize: 50,
      classType: Phaser.Physics.Arcade.Sprite,
      runChildUpdate: false
    });
    this.physics.add.collider(this.projectiles, this.groundGroup, this.handleProjectileCollision, undefined, this);

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
    
    // Log asset loading
    console.log('Loaded asset config:', ASSET_NAMES.PLAYER_RUN);
    console.log('Game config:', GAME_CONFIG);
  }

  update(): void {
    this.handleWeaponHotkeys();
    this.handleCrouch();
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
      this.player.setFlipX(false);
    } else if (dir === -1) {
      this.player.setFlipX(true);
    }
    
    if (this.player.getData('crouching')) {
      this.player.anims.stop();
      this.player.setTexture(SPRITE_KEYS.PLAYER_CROUCH);
    } else if (Math.abs(body.velocity.x) > 10) {
      this.player.anims.play(ANIMATION_KEYS.PLAYER_RUN, true);
    } else {
      this.player.anims.stop();
      this.player.setTexture(SPRITE_KEYS.PLAYER_IDLE);
    }

    this.updateAttachedVisuals();
    this.updateChargeBar();
    this.recycleFarProjectiles();
  }

  private handleJump(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.keys.W) || Phaser.Input.Keyboard.JustDown(this.keys.SPACE);

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
    const isCrouching = this.keys.CTRL.isDown;

    if (isCrouching === this.player.getData('crouching')) {
      return;
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const bottomBefore = body.bottom;
    this.player.setData('crouching', isCrouching);

    if (isCrouching) {
      const crouchHitbox = GAME_CONFIG.PLAYER.CROUCH_HITBOX;
      this.player.setTexture(SPRITE_KEYS.PLAYER_CROUCH);
      this.player.setScale(1, 1);
      body.setSize(crouchHitbox.width, crouchHitbox.height, false);
      body.setOffset(crouchHitbox.offsetX, crouchHitbox.offsetY);
      this.moveSpeed = GAME_CONFIG.PLAYER.MOVE_SPEED / 2;
    } else {
      this.player.setTexture(SPRITE_KEYS.PLAYER_IDLE);
      this.player.setScale(1, 1);
      body.setSize(ASSET_SPECS.PLAYER.IDLE.width, ASSET_SPECS.PLAYER.IDLE.height, false);
      body.setOffset(0, 0);
      this.moveSpeed = GAME_CONFIG.PLAYER.MOVE_SPEED;
    }

    this.keepBodyBottomAt(body, bottomBefore);
  }

  private keepBodyBottomAt(body: Phaser.Physics.Arcade.Body, bottomBefore: number): void {
    const deltaY = bottomBefore - body.bottom;

    if (Math.abs(deltaY) < 0.01) {
      return;
    }

    this.player.y += deltaY;
    body.updateFromGameObject();
  }

  private updateAttachedVisuals(): void {
    const pointer = this.input.activePointer;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const isCrouching = Boolean(this.player.getData('crouching'));
    const isRunning = !isCrouching && Math.abs(body.velocity.x) > 10;
    const moveSign = body.velocity.x < -10 ? -1 : 1;
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y - 8, pointer.worldX, pointer.worldY);
    const aimSign = Math.cos(angle) < 0 ? -1 : 1;
    const facingLeft = aimSign < 0;
    const weaponPose = this.getWeaponPose(isCrouching, isRunning, aimSign, moveSign);
    const spriteFacingSign = this.player.flipX ? -1 : 1;
    const helmetPose = this.getHelmetPose(isCrouching, isRunning, isRunning ? moveSign : spriteFacingSign);

    this.weapon.setPosition(this.player.x + weaponPose.x, this.player.y + weaponPose.y);
    this.weapon.setRotation(angle);
    this.weapon.setFlipY(facingLeft);
    this.weapon.setScale(this.getCurrentWeaponPoseConfig().DISPLAY_SCALE);
    this.weapon.setDepth(2);

    this.helmet.setPosition(this.player.x + helmetPose.x, this.player.y + helmetPose.y);
    this.helmet.setDepth(3);
    this.playerName?.setPosition(this.player.x + helmetPose.x, this.player.y + helmetPose.y + GAME_CONFIG.VISUALS.HELMET.NAME_OFFSET_Y);
  }

  private getWeaponPose(isCrouching: boolean, isRunning: boolean, aimSign: number, moveSign: number): PosePoint {
    const config = this.getCurrentWeaponPoseConfig();

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

  private getCurrentWeaponPoseConfig(): typeof GAME_CONFIG.WEAPONS.HAND_POSE[WeaponPoseKey] {
    return GAME_CONFIG.WEAPONS.HAND_POSE[WEAPON_POSE_KEYS[this.currentWeapon]];
  }

  private getHelmetPose(isCrouching: boolean, isRunning: boolean, moveSign: number): PosePoint {
    const config = GAME_CONFIG.VISUALS.HELMET;

    if (isCrouching) {
      return {
        x: config.CROUCH.x,
        y: config.CROUCH.y
      };
    }

    if (!isRunning) {
      return {
        x: (config.STAND.x * moveSign) + (moveSign < 0 ? config.STAND_LEFT_CORRECTION_X : 0),
        y: config.STAND.y
      };
    }

    const currentFrame = this.player.anims.currentFrame;
    const frameIndex = currentFrame ? currentFrame.index % config.RUN_FRAME_BOB_Y.length : 0;

    return {
      x: (config.RUN.x * moveSign) + (moveSign < 0 ? config.RUN_LEFT_CORRECTION_X : 0),
      y: config.RUN.y + config.RUN_FRAME_BOB_Y[frameIndex]
    };
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.rightButtonDown()) {
      return;
    }

    if (this.currentWeapon === 'grenade') {
      this.isChargingGrenade = true;
      this.grenadeChargeStartedAt = this.time.now;
      return;
    }

    this.fireDirectProjectile(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
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
    if (event.button !== 0 || event.target === this.game.canvas) {
      return;
    }

    const target = this.getWorldTargetFromWindowEvent(event);

    if (this.currentWeapon === 'grenade') {
      this.isChargingGrenade = true;
      this.grenadeChargeStartedAt = this.time.now;
      return;
    }

    this.fireDirectProjectile(target);
  }

  private handleWindowMouseUp(event: MouseEvent): void {
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

  private fireDirectProjectile(target: AimTarget): void {
    const projectile = this.obtainProjectile();
    if (!projectile) {
      return;
    }

    const isRocket = this.currentWeapon === 'rpg';
    const texture = isRocket ? SPRITE_KEYS.PROJECTILE_ROCKET : SPRITE_KEYS.PROJECTILE_BULLET;
    const speed = isRocket ? GAME_CONFIG.WEAPONS.DIRECT_PROJECTILE.ROCKET_SPEED : GAME_CONFIG.WEAPONS.DIRECT_PROJECTILE.BULLET_SPEED;
    const startX = this.weapon.x;
    const startY = this.weapon.y;
    const angle = Phaser.Math.Angle.Between(startX, startY, target.worldX, target.worldY);

    projectile.setTexture(texture);
    projectile.setPosition(startX, startY);
    projectile.setRotation(angle);
    projectile.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    (projectile.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    projectile.setData('expiresAt', this.time.now + 2000);
  }

  private throwGrenade(target: AimTarget): void {
    const projectile = this.obtainProjectile();
    if (!projectile) {
      return;
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
    projectile.setData('expiresAt', this.time.now + 2600);
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

  private handleProjectileCollision(projectileObject: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile): void {
    if (projectileObject instanceof Phaser.Tilemaps.Tile) {
      return;
    }

    this.disableProjectile(projectileObject as Phaser.Physics.Arcade.Sprite);
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
    this.currentWeapon = weapon;
    const textureByWeapon: Record<WeaponKind, string> = {
      pistol: SPRITE_KEYS.WEAPON_PISTOL,
      auto: SPRITE_KEYS.WEAPON_AUTO,
      grenade: SPRITE_KEYS.WEAPON_GRENADE,
      rpg: SPRITE_KEYS.WEAPON_RPG
    };

    this.weapon.setTexture(textureByWeapon[weapon]);
    const poseConfig = GAME_CONFIG.WEAPONS.HAND_POSE[WEAPON_POSE_KEYS[weapon]];
    this.weapon.setOrigin(poseConfig.ORIGIN_X, 0.5);
    this.weapon.setScale(poseConfig.DISPLAY_SCALE);
  }
}
