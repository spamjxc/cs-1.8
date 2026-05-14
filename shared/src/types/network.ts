import { TEAM } from '../constants';

export type TeamId = typeof TEAM.RED | typeof TEAM.BLUE;
export type WeaponId = 'fist' | 'pistol' | 'auto' | 'grenade' | 'rpg';

export type InputCommand = {
  tick: number;
  move: -1 | 0 | 1;
  jump: boolean;
  crouch: boolean;
  click: boolean;
  pickup: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
};

export type HitEvent = {
  targetId: string;
  projectileX: number;
  projectileY: number;
  damage: number;
};

export type ExplosionEvent = {
  weapon: 'grenade' | 'rpg';
  x: number;
  y: number;
};

export type PickupEvent = {
  pickupId: string;
  crouch: boolean;
};

export type ShootEvent = {
  weapon: Exclude<WeaponId, 'fist'>;
};

export type GameEventPayload = {
  type: 'hit' | 'death' | 'respawn' | 'baseDamage' | 'explode' | 'pickup' | 'ammo';
  targetId?: string;
  hp?: number;
  ghostTimer?: number;
  x?: number;
  y?: number;
  radius?: number;
  knockback?: number;
  damage?: number;
  ownerId?: string;
  weapon?: WeaponId;
  ammo?: number;
};
