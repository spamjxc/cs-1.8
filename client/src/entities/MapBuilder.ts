import * as Phaser from 'phaser';
import { MAP } from '@shared/constants';
import { createMapLayout } from '@shared/utils/MapGeometry';

export type MapSpriteKeys = {
  floor: string;
  box: string;
  ceil: string;
  bound: string;
};

export class MapBuilder {
  private readonly tileSize = MAP.TILE_SIZE;

  constructor(
    private readonly groundGroup: Phaser.Physics.Arcade.StaticGroup,
    private readonly spriteKeys: MapSpriteKeys
  ) {}

  build(seed: number): void {
    this.groundGroup.clear(true, true);

    const layout = createMapLayout(seed);

    for (let col = 0; col < layout.columns; col++) {
      for (let row = 0; row <= layout.ceilingRows[col]; row++) {
        this.placeTile(col, row, this.spriteKeys.ceil, MAP.WALL_TINT);
      }

      for (let row = layout.floorRows[col]; row < layout.rows; row++) {
        this.placeTile(col, row, this.spriteKeys.floor);
      }
    }

    for (let row = 0; row < layout.rows; row++) {
      this.placeTile(0, row, this.spriteKeys.bound, MAP.WALL_TINT);
      this.placeTile(layout.columns - 1, row, this.spriteKeys.bound, MAP.WALL_TINT);
    }

    layout.coverStacks.forEach((cover) => {
      for (let dx = 0; dx < cover.width; dx++) {
        const floorRow = layout.floorRows[cover.col + dx] ?? layout.floorRows[cover.col];
        for (let dy = 0; dy < cover.heightRows; dy++) {
          this.placeTile(cover.col + dx, floorRow - 1 - dy, this.spriteKeys.box);
        }
      }
    });
  }

  private placeTile(col: number, row: number, key: string, tint?: number): void {
    const tile = this.groundGroup.create(
      col * this.tileSize + this.tileSize / 2,
      row * this.tileSize + this.tileSize / 2,
      key
    ) as Phaser.Physics.Arcade.Image;

    tile.setDisplaySize(this.tileSize, this.tileSize);
    if (typeof tint === 'number') {
      tile.setTint(tint);
    }
    tile.refreshBody();
  }
}
