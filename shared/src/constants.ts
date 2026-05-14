/**
 * Asset names - strict contract with file system
 * All names must match exactly the files in client/assets/
 */
export const ASSET_NAMES = {
  // Player sprites
  PLAYER_IDLE: 'player_base.png',
  PLAYER_RUN: 'player_run.png',
  PLAYER_CROUCH: 'player_crouch.png',
  PLAYER_DAMAGE: 'player_damage.png',
  PLAYER_GHOST: 'player_ghost.png',
  
  // Helmets
  HELMET_RED: 'helmet_red.png',
  HELMET_BLUE: 'helmet_blue.png',
  
  // Weapons (pickup items)
  WEAPON_PISTOL: 'pistol.png',
  WEAPON_AUTO: 'smg.png',
  WEAPON_GRENADE: 'grenade.png',
  WEAPON_RPG: 'bazooka.png',
  
  // Projectiles
  PROJ_BULLET: 'proj_bullet.png',
  PROJ_GRENADE: 'grenade.png',
  PROJ_ROCKET: 'proj_rocket.png',
  
  // Effects
  EXPLOSION_01: 'explosion.png',
  
  // Tiles
  TILE_FLOOR: 'tile_ground.png',
  TILE_WALL: 'tile_box.png',
  TILE_RAMP: 'tile_ramp.png',
  
  // Misc
  BOX: 'box.png',
  AMMO: 'ammo.webp'
} as const;

/**
 * Pixel-size and rendering contract for game assets.
 *
 * These values are the source of truth for loaders, hitbox setup and future
 * asset validation. Actual PNGs may contain transparent padding, but the
 * visible art should fit these sizes to keep gameplay readable.
 */
export const ASSET_SPECS = {
  PLAYER: {
    IDLE: { width: 49, height: 58 },
    RUN: { frameWidth: 49, frameHeight: 58, frames: 10 },
    CROUCH: { width: 49, height: 58 },
    DAMAGE: { width: 49, height: 58 },
    GHOST: { width: 49, height: 58 }
  },
  HELMET: {
    RED: { width: 24, height: 12 },
    BLUE: { width: 24, height: 12 },
    RUN_VERTICAL_BOB: true
  },
  WEAPON_PICKUP: {
    PISTOL: { width: 30, height: 20 },
    AUTO: { width: 40, height: 14 },
    GRENADE: { width: 17, height: 21 },
    RPG: { width: 48, height: 24 }
  },
  PROJECTILE: {
    BULLET: { width: 12, height: 5, file: ASSET_NAMES.PROJ_BULLET },
    GRENADE: { width: 17, height: 21, file: ASSET_NAMES.PROJ_GRENADE },
    ROCKET: { width: 28, height: 15, file: ASSET_NAMES.PROJ_ROCKET }
  },
  EFFECT: {
    EXPLOSION: {
      width: 64,
      height: 64,
      file: ASSET_NAMES.EXPLOSION_01,
      animation: 'scale-and-fade',
      startScale: 0.4,
      endScale: 2.2,
      durationMs: 300
    }
  },
  TILE: {
    FLOOR: { width: 64, height: 64 },
    WALL: { width: 64, height: 64 },
    RAMP: { width: 64, height: 64, collision: 'visual-only-for-mvp' }
  }
} as const;

/**
 * Tunable gameplay parameters.
 */
export const GAME_CONFIG = {
  PLAYER: {
    MOVE_SPEED: 340,
    GHOST_MOVE_SPEED: 420,
    JUMP_FORCE: -1000,
    DOUBLE_JUMP_FORCE: -800,
    RISE_GRAVITY_MULTIPLIER: 3.5,
    FALL_GRAVITY_MULTIPLIER: 4.0,
    MAX_FALL_SPEED: 1100,
    CROUCH_HITBOX: { width: 24, height: 29, offsetX: 12, offsetY: 29 },
    CROUCH_VISUAL_SCALE_Y: 0.68,
    FRICTION: 1000,
    RUN_ANIMATION_FPS: 20
  },
  WEAPONS: {
    HAND_POSE: {
      PISTOL: {
        STAND: { x: 2, y: 0 },
        RUN: { x: 10, y: 4 },
        CROUCH: { x: 2, y: 8 },
        ORIGIN_X: 0.18,
        DISPLAY_SCALE: 1
      },
      AUTO: {
        STAND: { x: 0, y: 0 },
        RUN: { x: 8, y: 0 },
        CROUCH: { x: 0, y: 8 },
        ORIGIN_X: 0.16,
        DISPLAY_SCALE: 1.25
      },
      GRENADE: {
        STAND: { x: 2, y: 4 },
        RUN: { x: 4, y: -4 },
        CROUCH: { x: 2, y: 12 },
        ORIGIN_X: 0.35,
        DISPLAY_SCALE: 1
      },
      RPG: {
        STAND: { x: 0, y: -4 },
        RUN: { x: 8, y: 0 },
        CROUCH: { x: 0, y: 4 },
        ORIGIN_X: 0.2,
        DISPLAY_SCALE: 1
      }
    },
    GRENADE_THROW: {
      TRAJECTORY: 'arc',
      MIN_THROW_FORCE: 360,
      MAX_THROW_FORCE: 760,
      CHARGE_TIME_MS: 900,
      CHARGE_BAR: {
        WIDTH: 48,
        HEIGHT: 6,
        OFFSET_Y: -42,
        BACKGROUND_COLOR: 0x1b1f1c,
        FILL_COLOR: 0x9bdc4a,
        BORDER_COLOR: 0xe8f3d0
      }
    },
    DIRECT_PROJECTILE: {
      TRAJECTORY: 'straight',
      PISTOL_SPEED: 900,
      AUTO_SPEED: 820,
      ROCKET_SPEED: 620
    }
  },
  WORLD: {
    GRAVITY: 1000
  },
  BASES: {
    WIDTH: 260
  },
  VISUALS: {
    HELMET: {
      STAND: { x: -3, y: -24 },
      STAND_LEFT_CORRECTION_X: 0,
      RUN: { x: 10, y: -24 },
      RUN_LEFT_CORRECTION_X: 0,
      CROUCH: { x: -3, y: -10 },
      CROUCH_LEFT_CORRECTION_X: 0,
      RUN_FRAME_BOB_Y: [3, 1, 0, 1, 1, 3, 1, 0, 1, 1],
      NAME_OFFSET_Y: -24
    }
  }
} as const;

/**
 * Backward-compatible aliases for older code while systems move to GAME_CONFIG.
 */
export const PHYSICS = {
  GRAVITY: GAME_CONFIG.WORLD.GRAVITY,
  MOVE_SPEED: GAME_CONFIG.PLAYER.MOVE_SPEED,
  JUMP_FORCE: GAME_CONFIG.PLAYER.JUMP_FORCE,
  FRICTION: GAME_CONFIG.PLAYER.FRICTION,
  DOUBLE_JUMP_FORCE: GAME_CONFIG.PLAYER.DOUBLE_JUMP_FORCE
} as const;

/**
 * Game constants
 */
export const GAME = {
  MAX_HP: 100,
  ZONE_DAMAGE_RATE: 5,
  RESPAWN_TIME: 30,
  GHOST_TIME: 30,
  MATCH_DURATION: 600, // 10 minutes in seconds
  PICKUP_COOLDOWN: 300, // ms
  BASE_DAMAGE_PER_SEC: 5
} as const;

export const NETWORK = {
  TICK_RATE: 20,
  TICK_MS: 50,
  MAX_INPUTS_PER_SEC: 20,
  HIT_RATE_LIMIT_MS: 80,
  MAX_HIT_DISTANCE: 96,
  DRIFT_CORRECTION_THRESHOLD: 3,
  DRIFT_CORRECTION_ALPHA: 0.28
} as const;

export const MAP = {
  WIDTH: 2560,
  HEIGHT: 720,
  GROUND_Y: 600,
  RED_SPAWN_X: 140,
  BLUE_SPAWN_X: 2420,
  BASE_WIDTH: GAME_CONFIG.BASES.WIDTH
} as const;

/**
 * Weapon stats
 */
export const WEAPONS = {
  FIST: { damage: 10, ammo: Infinity, type: 'melee' },
  PISTOL: { damage: 20, ammo: 50, type: 'projectile' },
  AUTO: { damage: 20, ammo: 100, type: 'projectile' },
  GRENADE: { damage: 50, ammo: 3, type: 'explosive' },
  RPG: { damage: 40, ammo: 3, type: 'explosive' }
} as const;

/**
 * Team identifiers
 */
export const TEAM = {
  RED: 'red',
  BLUE: 'blue'
} as const;

/**
 * Player states
 */
export const PLAYER_STATE = {
  ALIVE: 'alive',
  DEAD: 'dead',
  GHOST: 'ghost'
} as const;
