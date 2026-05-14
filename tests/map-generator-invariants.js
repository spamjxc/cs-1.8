#!/usr/bin/env node

const { execFileSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const seedCount = parseSeedCount(process.argv[2] || process.env.MAP_TEST_SEEDS || '500');

buildShared();

const { MAP } = require(path.join(repoRoot, 'shared/dist/constants'));
const {
  createMapLayout,
  getFloorTopAtX,
  getMaxCoverHeightRows,
  getPickupY,
  getPlayerSpawnY
} = require(path.join(repoRoot, 'shared/dist/utils/MapGeometry'));

run();

function run() {
  const maxCoverHeightRows = getMaxCoverHeightRows();
  const seeds = [MAP.DEFAULT_SEED];

  for (let index = 1; index <= seedCount; index++) {
    seeds.push(index * 9973);
  }

  seeds.forEach((seed) => validateSeed(seed, maxCoverHeightRows));
  console.log(`Map generator invariants OK for ${seeds.length} seeds`);
}

function validateSeed(seed, maxCoverHeightRows) {
  const layout = createMapLayout(seed);

  assert(layout.columns === Math.floor(MAP.WIDTH / MAP.TILE_SIZE), seed, 'unexpected column count');
  assert(layout.rows === Math.ceil(MAP.HEIGHT / MAP.TILE_SIZE), seed, 'unexpected row count');
  assert(layout.floorRows.length === layout.columns, seed, 'floor row count mismatch');
  assert(layout.ceilingRows.length === layout.columns, seed, 'ceiling row count mismatch');

  for (let col = 0; col < layout.columns; col++) {
    const floorRow = layout.floorRows[col];
    const ceilingRow = layout.ceilingRows[col];
    const openRows = floorRow - ceilingRow - 1;

    assert(Number.isInteger(floorRow), seed, `floor row is not integer at col ${col}`);
    assert(Number.isInteger(ceilingRow), seed, `ceiling row is not integer at col ${col}`);
    assert(ceilingRow >= 1, seed, `ceiling is too high/outside world at col ${col}`);
    assert(floorRow < layout.rows, seed, `floor is outside world at col ${col}`);
    assert(ceilingRow < floorRow, seed, `ceiling intersects floor at col ${col}`);
    assert(openRows >= MAP.CORRIDOR_MIN_OPEN_ROWS, seed, `corridor too tight at col ${col}: ${openRows}`);
    assert(openRows <= MAP.CORRIDOR_MAX_OPEN_ROWS + MAP.MAX_STEP_ROWS, seed, `corridor too open at col ${col}: ${openRows}`);

    if (col > 0) {
      assert(Math.abs(floorRow - layout.floorRows[col - 1]) <= MAP.MAX_STEP_ROWS, seed, `floor step too high at col ${col}`);
      assert(Math.abs(ceilingRow - layout.ceilingRows[col - 1]) <= MAP.MAX_STEP_ROWS, seed, `ceiling step too high at col ${col}`);
    }
  }

  layout.coverStacks.forEach((cover, index) => {
    assert(cover.col > 0, seed, `cover ${index} starts outside left wall`);
    assert(cover.col + cover.width < layout.columns - 1, seed, `cover ${index} reaches right wall`);
    assert(cover.width >= 1 && cover.width <= MAP.COVER_MAX_WIDTH_COLUMNS, seed, `cover ${index} has invalid width`);
    assert(cover.heightRows >= 1 && cover.heightRows <= maxCoverHeightRows, seed, `cover ${index} is too high to jump`);

    for (let dx = 0; dx < cover.width; dx++) {
      const col = cover.col + dx;
      const floorRow = layout.floorRows[col];
      const ceilingRow = layout.ceilingRows[col];
      const coverTopRow = floorRow - cover.heightRows;

      assert(coverTopRow > ceilingRow + 1, seed, `cover ${index} blocks corridor at col ${col}`);
    }
  });

  validateWorldY(seed, layout, MAP.RED_SPAWN_X, getPlayerSpawnY(seed, MAP.RED_SPAWN_X), 'red spawn');
  validateWorldY(seed, layout, MAP.BLUE_SPAWN_X, getPlayerSpawnY(seed, MAP.BLUE_SPAWN_X), 'blue spawn');

  const pickupXs = createPickupProbeXs();
  pickupXs.forEach((x) => validateWorldY(seed, layout, x, getPickupY(seed, x), `pickup at x=${x}`));
}

function validateWorldY(seed, layout, x, y, label) {
  const floorTop = getFloorTopAtX(layout, x);

  assert(Number.isFinite(y), seed, `${label} y is not finite`);
  assert(y > 0 && y < floorTop, seed, `${label} is not above floor`);
  assert(floorTop <= MAP.HEIGHT + MAP.TILE_SIZE, seed, `${label} floor is outside world`);
}

function createPickupProbeXs() {
  const count = 8;
  const spacing = MAP.WIDTH / (count + 1);
  const xs = [];

  for (let index = 0; index < count; index++) {
    xs.push(Math.round(spacing * (index + 1)));
  }

  return xs;
}

function buildShared() {
  execFileSync(npmBin, ['run', 'build:shared'], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
}

function parseSeedCount(rawValue) {
  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Seed count must be a positive integer, got: ${rawValue}`);
  }

  return parsed;
}

function assert(condition, seed, message) {
  if (!condition) {
    throw new Error(`Seed ${seed}: ${message}`);
  }
}
