import * as Phaser from 'phaser';
import { ASSET_NAMES, GAME_CONFIG } from '@shared/constants';

type MovementKeys = {
  A: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

const SPRITE_KEYS = {
  PLAYER_IDLE: 'player.idle',
  PLAYER_RUN: 'player.run',
  FLOOR: 'tile.floor',
  WALL: 'tile.wall',
  HELMET_RED: 'helmet.red',
  HELMET_BLUE: 'helmet.blue'
} as const;

const ANIMATION_KEYS = {
  PLAYER_RUN: 'player.run'
} as const;

export default class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: MovementKeys;
  private groundGroup!: Phaser.Physics.Arcade.StaticGroup;

  constructor() {
    super('GameScene');
  }

  preload(): void {
    // Load tile assets
    this.load.image(SPRITE_KEYS.FLOOR, `assets/${ASSET_NAMES.TILE_FLOOR}`);
    this.load.image(SPRITE_KEYS.WALL, `assets/${ASSET_NAMES.TILE_WALL}`);
    
    // Load player sprites
    this.load.image(SPRITE_KEYS.PLAYER_IDLE, `assets/${ASSET_NAMES.PLAYER_IDLE}`);
    this.load.spritesheet(SPRITE_KEYS.PLAYER_RUN, `assets/${ASSET_NAMES.PLAYER_RUN}`, {
      frameWidth: 49,
      frameHeight: 58
    });
    
    // Load helmet assets
    this.load.image(SPRITE_KEYS.HELMET_RED, `assets/${ASSET_NAMES.HELMET_RED}`);
    this.load.image(SPRITE_KEYS.HELMET_BLUE, `assets/${ASSET_NAMES.HELMET_BLUE}`);
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
    
    // Add collider between player and ground
    this.physics.add.collider(this.player, this.groundGroup);
    
    // Create animations
    this.anims.create({
      key: ANIMATION_KEYS.PLAYER_RUN,
      frames: this.anims.generateFrameNumbers(SPRITE_KEYS.PLAYER_RUN, { start: 0, end: 9 }),
      frameRate: GAME_CONFIG.PLAYER.RUN_ANIMATION_FPS,
      repeat: -1
    });
    
    // Setup input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('A,D') as MovementKeys;
    
    // Log asset loading
    console.log('Loaded asset config:', ASSET_NAMES.PLAYER_RUN);
    console.log('Game config:', GAME_CONFIG);
  }

  update(): void {
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
    body.setVelocityX(dir * GAME_CONFIG.PLAYER.MOVE_SPEED);
    
    // Flip sprite based on direction
    if (dir === 1) {
      this.player.setFlipX(false);
    } else if (dir === -1) {
      this.player.setFlipX(true);
    }
    
    // Handle animation switching
    if (Math.abs(body.velocity.x) > 10) {
      this.player.anims.play(ANIMATION_KEYS.PLAYER_RUN, true);
    } else {
      this.player.anims.stop();
      this.player.setTexture(SPRITE_KEYS.PLAYER_IDLE);
    }
  }
}
