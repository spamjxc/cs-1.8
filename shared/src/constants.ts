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
  TILE_RAMP: 'tile_box.png'
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
    RAMP: { width: 64, height: 64, collision: 'visual-only-for-mvp' },
    BOX: { width: 64, height: 64 }
  }
} as const;

/**
 * Tunable gameplay parameters.
 */
export const GAME_CONFIG = {
  PLAYER: {
    MOVE_SPEED: 420,
    GHOST_MOVE_SPEED: 600,
    JUMP_FORCE: -1000,
    DOUBLE_JUMP_FORCE: -800,
    RISE_GRAVITY_MULTIPLIER: 3.5,
    FALL_GRAVITY_MULTIPLIER: 4.0,
    MAX_FALL_SPEED: 2000,
    CROUCH_HITBOX: { width: 24, height: 29, offsetX: 12, offsetY: 29 },
    CROUCH_VISUAL_SCALE_Y: 0.68,
    FRICTION: 1000,
    RUN_ANIMATION_FPS: 20
  },
  WEAPONS: {
    FIST_DAMAGE: 10,
    PICKUP_RADIUS: 72,
    MELEE_RANGE: 44,
    DEFAULT_PICKUPS: 8,
    FIST_ARM: {
      NORMAL_LENGTH: 12,
      ATTACK_LENGTH: 30,
      THICKNESS: 5,
      OFFSET_X: -5,
      OFFSET_Y: -5,
      ATTACK_MS: 50,
      RETURN_MS: 50,
      FILL_COLOR: 0xffffff,
      STROKE_COLOR: 0x050505,
      STROKE_WIDTH: 1
    },
    EXPLOSION: {
      GRENADE_RADIUS: 180,
      RPG_RADIUS: 130,
      GRENADE_KNOCKBACK: 1520,
      RPG_KNOCKBACK: 1020
    },
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
        DISPLAY_SCALE: 1.35
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
      MIN_THROW_FORCE: 400,
      MAX_THROW_FORCE: 1000,
      CHARGE_TIME_MS: 1000,
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
      PISTOL_BULLET_SPEED: 2800,
      AUTO_BULLET_SPEED: 1700,
      ROCKET_SPEED: 1700,
      AUTO_FIRE_RATE_PER_SEC: 12
    }
  },
  WORLD: {
    GRAVITY: 1000
  },
  CAMERA: {
    ZOOM: 1,
    MOBILE_ZOOM: 0.82,
    MOBILE_ZOOM_DIVISOR: 1.5,
    FOLLOW_LERP: 0.65,
    ROUND_PIXELS: false
  },
  MOBILE: {
    SMALL_SCREEN_WIDTH: 760,
    SMALL_SCREEN_HEIGHT: 560,
    STICK_RADIUS: 58,
    STICK_SCALE: 1.18,
    STICK_DEADZONE: 10,
    MOVE_THRESHOLD: 0.24,
    JUMP_THRESHOLD: -0.46,
    CROUCH_THRESHOLD: 0.55,
    DOUBLE_JUMP_DELAY_MS: 260,
    UI_SCALE_DIVISOR: 1.5,
    PANEL_EDGE_PX: 8,
    PANEL_BOTTOM_GAP_PX: 8
  },
  BASES: {
    WIDTH: 1400,
    DAMAGE_WARNING_MIN_ALPHA: 0.12,
    DAMAGE_WARNING_MAX_ALPHA: 0.28,
    DAMAGE_WARNING_BLINK_MS: 20
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
  GHOST_TIME: 5,
  MATCH_DURATION: 600, // 10 minutes in seconds
  PICKUP_COOLDOWN: 300, // ms
  BASE_DAMAGE_PER_SEC: 20
} as const;

export const MATCH_PHASES = {
  FIGHT_DURATION_SECONDS: 5 * 60,
  PAUSE_DURATION_SECONDS: 30
} as const;

export const ADMIN_CONFIG = {
  PASSWORD: 'radiation'
} as const;

export const NETWORK = {
  TICK_RATE: 20,
  TICK_MS: 50,
  MAX_INPUTS_PER_SEC: 20,
  HIT_RATE_LIMIT_MS: 80,
  MAX_HIT_DISTANCE: 96,
  DRIFT_CORRECTION_THRESHOLD: 16,
  DRIFT_CORRECTION_ALPHA: 0.12
} as const;

export const MAP = {
  WIDTH: 5520,
  HEIGHT: 720,
  GROUND_Y: 600,
  RED_SPAWN_X: 140,
  BLUE_SPAWN_X: 5380,
  BASE_WIDTH: GAME_CONFIG.BASES.WIDTH,
  TILE_SIZE: 64,
  DEFAULT_SEED: 180818,
  MAX_STEP_ROWS: 1,
  CORRIDOR_MIN_OPEN_ROWS: 4,
  CORRIDOR_MAX_OPEN_ROWS: 5,
  FLOOR_MIN_ROW: 7,
  FLOOR_MAX_ROW: 9,
  COVER_MIN_SPACING_COLUMNS: 4,
  COVER_MAX_SPACING_COLUMNS: 8,
  COVER_EDGE_SAFE_COLUMNS: 5,
  COVER_MAX_WIDTH_COLUMNS: 2,
  PLAYER_SPAWN_CLEARANCE: 30,
  PICKUP_FLOOR_OFFSET: 20,
  WALL_TINT: 0xb3b3b3
} as const;

/**
 * Weapon stats
 */
export const WEAPONS = {
  FIST: { damage: GAME_CONFIG.WEAPONS.FIST_DAMAGE, ammo: Infinity, type: 'melee' },
  PISTOL: { damage: 10, ammo: 15, type: 'projectile' },
  AUTO: { damage: 10, ammo: 60, type: 'projectile' },
  GRENADE: { damage: 40, ammo: 3, type: 'explosive' },
  RPG: { damage: 30, ammo: 5, type: 'explosive' }
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
