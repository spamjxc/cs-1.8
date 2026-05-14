import { Schema, type } from '@colyseus/schema';
import { GAME, MAP, TEAM } from '../constants';
import { TeamId } from '../types/network';

export class PlayerSchema extends Schema {
  @type('string') id: string = '';
  @type('string') nick: string = 'Player';
  @type('number') x: number = MAP.RED_SPAWN_X;
  @type('number') y: number = MAP.GROUND_Y;
  @type('number') vx: number = 0;
  @type('number') vy: number = 0;
  @type('number') hp: number = GAME.MAX_HP;
  @type('boolean') ghost: boolean = false;
  @type('number') ghostTimer: number = 0;
  @type('string') team: TeamId = TEAM.RED;
  @type('boolean') crouch: boolean = false;
  @type('number') lastInputTick: number = 0;
  @type('string') weapon: string = 'pistol';
  @type('number') ammo: number = 50;
  @type('number') aimAngle: number = 0;
  @type('number') kills: number = 0;
  @type('number') deaths: number = 0;
}
