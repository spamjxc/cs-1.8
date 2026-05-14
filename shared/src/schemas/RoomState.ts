import { MapSchema, Schema, type } from '@colyseus/schema';
import { MAP } from '../constants';
import { PlayerSchema } from './PlayerSchema';
import { WeaponPickupSchema } from './WeaponPickupSchema';

export class RoomState extends Schema {
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ map: WeaponPickupSchema }) pickups = new MapSchema<WeaponPickupSchema>();
  @type('number') serverTick: number = 0;
  @type('number') mapSeed: number = MAP.DEFAULT_SEED;
  @type('number') mapWidth: number = MAP.WIDTH;
  @type('number') mapHeight: number = MAP.HEIGHT;
  @type('string') phase: string = 'lobby';
  @type('number') phaseTimer: number = 0;
  @type('number') redScore: number = 0;
  @type('number') blueScore: number = 0;
  @type('boolean') autoBalance: boolean = false;
}
