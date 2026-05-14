import * as Phaser from 'phaser';
import { TEAM } from '@shared/constants';
import type { WeaponId } from '@shared/types/network';
import { Interpolator } from '@client/utils/Interpolator';

export type MovementKeys = {
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

export type WeaponKind = WeaponId;
export type WeaponPoseKey = 'PISTOL' | 'AUTO' | 'GRENADE' | 'RPG';
export type PosePoint = {
  x: number;
  y: number;
};
export type AimTarget = {
  worldX: number;
  worldY: number;
};

export type RemotePlayerView = {
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
  crouch: boolean;
  lastVx: number;
  weaponKind: WeaponKind;
  aimAngle: number;
};

export const SPRITE_KEYS = {
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

export const ANIMATION_KEYS = {
  PLAYER_RUN: 'player.run'
} as const;

export const WEAPON_POSE_KEYS: Record<Exclude<WeaponKind, 'fist'>, WeaponPoseKey> = {
  pistol: 'PISTOL',
  auto: 'AUTO',
  grenade: 'GRENADE',
  rpg: 'RPG'
};
