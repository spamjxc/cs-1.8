import * as Phaser from 'phaser';

export type InterpolationSample = {
  tick: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export class Interpolator {
  private readonly samples: InterpolationSample[] = [];

  push(sample: InterpolationSample): void {
    this.samples.push(sample);
    this.samples.sort((a, b) => a.tick - b.tick);

    while (this.samples.length > 2) {
      this.samples.shift();
    }
  }

  reset(sample: InterpolationSample): void {
    this.samples.length = 0;
    this.samples.push(sample);
  }

  update(): InterpolationSample | undefined {
    if (this.samples.length === 0) {
      return undefined;
    }

    if (this.samples.length === 1) {
      return this.samples[0];
    }

    const from = this.samples[0];
    const to = this.samples[1];

    return {
      tick: to.tick,
      x: Phaser.Math.Linear(from.x, to.x, 0.6),
      y: Phaser.Math.Linear(from.y, to.y, 0.6),
      vx: Phaser.Math.Linear(from.vx, to.vx, 0.6),
      vy: Phaser.Math.Linear(from.vy, to.vy, 0.6)
    };
  }
}
