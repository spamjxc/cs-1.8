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
  PROJ_GRENADE: 'proj_grenade.png',
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
 * Physics constants
 */
export const PHYSICS = {
  GRAVITY: 1000,
  MOVE_SPEED: 200,
  JUMP_FORCE: -450,
  FRICTION: 1000,
  DOUBLE_JUMP_FORCE: -400
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
