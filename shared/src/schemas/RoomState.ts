import { MapSchema, Schema, type } from '@colyseus/schema';
import { MAP } from '../constants';
import { PlayerSchema } from './PlayerSchema';

export class RoomState extends Schema {
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type('number') serverTick: number = 0;
  @type('number') mapWidth: number = MAP.WIDTH;
  @type('number') mapHeight: number = MAP.HEIGHT;
}
