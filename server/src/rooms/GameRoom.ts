import { Client, Room } from '@colyseus/core';
import { GAME, MAP, NETWORK, TEAM, WEAPONS } from '@shared/constants';
import { PlayerSchema } from '@shared/schemas/PlayerSchema';
import { RoomState } from '@shared/schemas/RoomState';
import { GameEventPayload, HitEvent, InputCommand, TeamId } from '@shared/types/network';

type JoinOptions = {
  nick?: string;
  team?: TeamId;
};

type PlayerRuntime = {
  inputWindowStartedAt: number;
  inputCount: number;
  lastHitAt: number;
  baseDamageAccumulator: number;
  ignoreInputUntil: number;
};

const VALID_TEAMS: TeamId[] = [TEAM.RED, TEAM.BLUE];

export class GameRoom extends Room<RoomState> {
  maxClients = 20;
  private readonly runtime = new Map<string, PlayerRuntime>();

  onCreate(): void {
    this.setState(new RoomState());
    this.setSimulationInterval(() => this.tick(), NETWORK.TICK_MS);
    this.onMessage('input', (client, data: InputCommand) => this.handleInput(client, data));
    this.onMessage('hit', (client, data: HitEvent) => this.handleHit(client, data));
    console.log('GameRoom created');
  }

  onJoin(client: Client, options: JoinOptions): void {
    const nick = this.sanitizeNick(options.nick);
    const team = VALID_TEAMS.indexOf(options.team as TeamId) >= 0 ? (options.team as TeamId) : TEAM.RED;
    const player = new PlayerSchema();

    player.id = client.sessionId;
    player.nick = nick;
    player.team = team;
    this.spawnAtBase(player);
    this.state.players.set(client.sessionId, player);
    this.runtime.set(client.sessionId, {
      inputWindowStartedAt: Date.now(),
      inputCount: 0,
      lastHitAt: 0,
      baseDamageAccumulator: 0,
      ignoreInputUntil: 0
    });

    console.log(`Player joined: ${nick} (${team}) [${client.sessionId}]`);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.runtime.delete(client.sessionId);
    console.log(`Player left: ${client.sessionId}`);
  }

  private tick(): void {
    this.state.serverTick++;

    this.state.players.forEach((player) => {
      if (player.ghost) {
        this.updateGhost(player);
        return;
      }

      this.applyBaseDamage(player);
    });
  }

  private handleInput(client: Client, data: InputCommand): void {
    const player = this.state.players.get(client.sessionId);
    const runtime = this.runtime.get(client.sessionId);

    if (!player || !runtime || Date.now() < runtime.ignoreInputUntil || !this.acceptInput(runtime)) {
      return;
    }

    player.lastInputTick = this.clampNumber(data.tick, 0, Number.MAX_SAFE_INTEGER);
    player.crouch = Boolean(data.crouch);
    player.x = this.clampNumber(data.x, 0, MAP.WIDTH);
    player.y = this.clampNumber(data.y, 0, MAP.HEIGHT);
    player.vx = this.clampNumber(data.vx, -1200, 1200);
    player.vy = this.clampNumber(data.vy, -1400, 1400);
  }

  private handleHit(client: Client, data: HitEvent): void {
    const attacker = this.state.players.get(client.sessionId);
    const target = this.state.players.get(data.targetId);
    const runtime = this.runtime.get(client.sessionId);
    const now = Date.now();

    if (!attacker || !target || !runtime || target.ghost || attacker.ghost || !this.isValidHitPayload(data)) {
      return;
    }

    if (now - runtime.lastHitAt < NETWORK.HIT_RATE_LIMIT_MS || attacker.team === target.team) {
      return;
    }

    const distance = Math.hypot(target.x - data.projectileX, target.y - data.projectileY);
    if (distance > NETWORK.MAX_HIT_DISTANCE) {
      return;
    }

    runtime.lastHitAt = now;
    target.hp = Math.max(0, target.hp - this.normalizeDamage(data.damage));
    console.log(`Hit validated: ${client.sessionId} -> ${data.targetId}`);
    console.log(`Damage applied: ${target.hp} HP left`);
    this.broadcastEvent({ type: 'hit', targetId: target.id, hp: target.hp });

    if (target.hp <= 0) {
      this.kill(target);
    }
  }

  private updateGhost(player: PlayerSchema): void {
    player.ghostTimer = Math.max(0, player.ghostTimer - NETWORK.TICK_MS / 1000);

    if (player.ghostTimer <= 0) {
      this.spawnAtBase(player);
      const runtime = this.runtime.get(player.id);
      if (runtime) {
        runtime.ignoreInputUntil = Date.now() + 200;
      }
      this.broadcastEvent({
        type: 'respawn',
        targetId: player.id,
        hp: player.hp,
        ghostTimer: player.ghostTimer,
        x: player.x,
        y: player.y
      });
    }
  }

  private applyBaseDamage(player: PlayerSchema): void {
    if (!this.isInEnemyBase(player)) {
      const runtime = this.runtime.get(player.id);
      if (runtime) {
        runtime.baseDamageAccumulator = 0;
      }
      return;
    }

    const runtime = this.runtime.get(player.id);
    if (!runtime) {
      return;
    }

    runtime.baseDamageAccumulator += NETWORK.TICK_MS / 1000;
    const damage = GAME.BASE_DAMAGE_PER_SEC * (NETWORK.TICK_MS / 1000);
    player.hp = Math.max(0, player.hp - damage);

    if (runtime.baseDamageAccumulator >= 1) {
      runtime.baseDamageAccumulator = 0;
      this.broadcastEvent({ type: 'baseDamage', targetId: player.id, hp: player.hp });
    }

    if (player.hp <= 0) {
      this.kill(player);
    }
  }

  private kill(player: PlayerSchema): void {
    player.hp = 0;
    player.ghost = true;
    player.ghostTimer = GAME.GHOST_TIME;
    player.vx = 0;
    player.vy = 0;
    console.log(`Kill registered: ${player.id}`);
    this.broadcastEvent({
      type: 'death',
      targetId: player.id,
      hp: player.hp,
      ghostTimer: player.ghostTimer
    });
  }

  private spawnAtBase(player: PlayerSchema): void {
    player.x = player.team === TEAM.RED ? MAP.RED_SPAWN_X : MAP.BLUE_SPAWN_X;
    player.y = MAP.GROUND_Y;
    player.vx = 0;
    player.vy = 0;
    player.hp = GAME.MAX_HP;
    player.ghost = false;
    player.ghostTimer = 0;
    player.crouch = false;
  }

  private isInEnemyBase(player: PlayerSchema): boolean {
    return (player.team === TEAM.BLUE && player.x < MAP.BASE_WIDTH) ||
      (player.team === TEAM.RED && player.x > MAP.WIDTH - MAP.BASE_WIDTH);
  }

  private acceptInput(runtime: PlayerRuntime): boolean {
    const now = Date.now();

    if (now - runtime.inputWindowStartedAt >= 1000) {
      runtime.inputWindowStartedAt = now;
      runtime.inputCount = 0;
    }

    runtime.inputCount++;

    if (runtime.inputCount > NETWORK.MAX_INPUTS_PER_SEC + 2) {
      console.log('Rate limit exceeded');
      return false;
    }

    return true;
  }

  private normalizeDamage(damage: number): number {
    const allowedDamages: number[] = [
      WEAPONS.FIST.damage,
      WEAPONS.PISTOL.damage,
      WEAPONS.AUTO.damage,
      WEAPONS.GRENADE.damage,
      WEAPONS.RPG.damage
    ];

    return allowedDamages.indexOf(damage) >= 0 ? damage : WEAPONS.PISTOL.damage;
  }

  private isValidHitPayload(data: HitEvent): boolean {
    return typeof data.targetId === 'string' &&
      Number.isFinite(data.projectileX) &&
      Number.isFinite(data.projectileY) &&
      Number.isFinite(data.damage);
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return min;
    }

    return Math.max(min, Math.min(max, value));
  }

  private sanitizeNick(nick?: string): string {
    return (nick || 'Player').trim().slice(0, 12) || 'Player';
  }

  private broadcastEvent(payload: GameEventPayload): void {
    this.broadcast('event', payload);
  }
}
