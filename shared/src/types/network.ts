import { TEAM } from '../constants';

export type TeamId = typeof TEAM.RED | typeof TEAM.BLUE;

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
};

export type HitEvent = {
  targetId: string;
  projectileX: number;
  projectileY: number;
  damage: number;
};

export type GameEventPayload = {
  type: 'hit' | 'death' | 'respawn' | 'baseDamage';
  targetId: string;
  hp?: number;
  ghostTimer?: number;
  x?: number;
  y?: number;
};
