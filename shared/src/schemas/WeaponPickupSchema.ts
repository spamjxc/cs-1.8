import { Schema, type } from '@colyseus/schema';

export class WeaponPickupSchema extends Schema {
  @type('string') id: string = '';
  @type('string') weapon: string = 'pistol';
  @type('number') ammo: number = 0;
  @type('number') x: number = 0;
  @type('number') y: number = 0;
}
