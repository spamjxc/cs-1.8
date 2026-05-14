import { ASSET_SPECS, GAME_CONFIG, MAP } from '../constants';

export type CoverStack = {
  col: number;
  width: number;
  heightRows: number;
};

export type MapLayout = {
  columns: number;
  rows: number;
  floorRows: number[];
  ceilingRows: number[];
  coverStacks: CoverStack[];
};

type Rng = () => number;

export function createMapLayout(seed: number): MapLayout {
  const rng = createRng(seed || MAP.DEFAULT_SEED);
  const columns = Math.floor(MAP.WIDTH / MAP.TILE_SIZE);
  const rows = Math.ceil(MAP.HEIGHT / MAP.TILE_SIZE);
  const floorRows = createFloorRows(columns, rng);
  const ceilingRows = createCeilingRows(floorRows, rng);
  const coverStacks = createCoverStacks(floorRows, ceilingRows, rng);

  return {
    columns,
    rows,
    floorRows,
    ceilingRows,
    coverStacks
  };
}

export function getFloorTopAtX(layout: MapLayout, x: number): number {
  const col = clamp(Math.floor(x / MAP.TILE_SIZE), 0, layout.columns - 1);
  return layout.floorRows[col] * MAP.TILE_SIZE;
}

export function getPlayerSpawnY(seed: number, x: number): number {
  return getFloorTopAtX(createMapLayout(seed), x) - MAP.PLAYER_SPAWN_CLEARANCE;
}

export function getPickupY(seed: number, x: number): number {
  return getFloorTopAtX(createMapLayout(seed), x) - MAP.PICKUP_FLOOR_OFFSET;
}

export function getMaxCoverHeightRows(): number {
  const riseGravity = GAME_CONFIG.WORLD.GRAVITY * GAME_CONFIG.PLAYER.RISE_GRAVITY_MULTIPLIER;
  const firstJumpHeight = Math.pow(Math.abs(GAME_CONFIG.PLAYER.JUMP_FORCE), 2) / (2 * riseGravity);
  const secondJumpHeight = Math.pow(Math.abs(GAME_CONFIG.PLAYER.DOUBLE_JUMP_FORCE), 2) / (2 * riseGravity);
  const availableHeight = firstJumpHeight + secondJumpHeight - ASSET_SPECS.PLAYER.IDLE.height - 16;

  return clamp(Math.floor(availableHeight / MAP.TILE_SIZE), 1, 2);
}

function createFloorRows(columns: number, rng: Rng): number[] {
  const floorRows: number[] = [];
  let currentRow = clamp(Math.round(MAP.GROUND_Y / MAP.TILE_SIZE), MAP.FLOOR_MIN_ROW, MAP.FLOOR_MAX_ROW);
  let segmentLeft = 0;

  for (let col = 0; col < columns; col++) {
    if (segmentLeft <= 0 && col > 2 && col < columns - 3) {
      currentRow += rng() > 0.5 ? 1 : -1;
      currentRow = clamp(currentRow, MAP.FLOOR_MIN_ROW, MAP.FLOOR_MAX_ROW);
      segmentLeft = 2 + Math.floor(rng() * 4);
    }

    floorRows[col] = currentRow;
    segmentLeft--;
  }

  return smoothRows(floorRows, MAP.MAX_STEP_ROWS);
}

function createCeilingRows(floorRows: number[], rng: Rng): number[] {
  const ceilingRows: number[] = [];
  let segmentLeft = 0;
  let openness: number = MAP.CORRIDOR_MIN_OPEN_ROWS;

  for (let col = 0; col < floorRows.length; col++) {
    if (segmentLeft <= 0) {
      openness = MAP.CORRIDOR_MIN_OPEN_ROWS + Math.floor(rng() * (MAP.CORRIDOR_MAX_OPEN_ROWS - MAP.CORRIDOR_MIN_OPEN_ROWS + 1));
      segmentLeft = 2 + Math.floor(rng() * 5);
    }

    ceilingRows[col] = clamp(floorRows[col] - openness - 1, 1, floorRows[col] - 4);
    segmentLeft--;
  }

  return smoothRows(ceilingRows, MAP.MAX_STEP_ROWS);
}

function createCoverStacks(floorRows: number[], ceilingRows: number[], rng: Rng): CoverStack[] {
  const coverStacks: CoverStack[] = [];
  const maxHeight = getMaxCoverHeightRows();
  let col = MAP.COVER_EDGE_SAFE_COLUMNS;

  while (col < floorRows.length - MAP.COVER_EDGE_SAFE_COLUMNS) {
    col += MAP.COVER_MIN_SPACING_COLUMNS + Math.floor(rng() * (MAP.COVER_MAX_SPACING_COLUMNS - MAP.COVER_MIN_SPACING_COLUMNS + 1));

    if (col >= floorRows.length - MAP.COVER_EDGE_SAFE_COLUMNS || rng() < 0.18) {
      continue;
    }

    const width = 1 + Math.floor(rng() * MAP.COVER_MAX_WIDTH_COLUMNS);
    const heightRows = 1 + Math.floor(rng() * maxHeight);
    const openRows = floorRows[col] - ceilingRows[col] - 1;

    if (openRows - heightRows < 3) {
      continue;
    }

    coverStacks.push({ col, width, heightRows });
  }

  return coverStacks;
}

function smoothRows(rows: number[], maxDelta: number): number[] {
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1];
    const delta = rows[index] - previous;

    if (Math.abs(delta) > maxDelta) {
      rows[index] = previous + Math.sign(delta) * maxDelta;
    }
  }

  return rows;
}

function createRng(seed: number): Rng {
  let state = seed >>> 0;

  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
