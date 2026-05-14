import { Client, Room } from '@colyseus/core';
import { ADMIN_CONFIG, GAME, GAME_CONFIG, MAP, MATCH_PHASES, NETWORK, TEAM, WEAPONS } from '@shared/constants';
import { PlayerSchema } from '@shared/schemas/PlayerSchema';
import { RoomState } from '@shared/schemas/RoomState';
import { WeaponPickupSchema } from '@shared/schemas/WeaponPickupSchema';
import { AdminAuthEvent, AdminCommandEvent, ExplosionEvent, GameEventPayload, HitEvent, InputCommand, MatchPhase, PickupEvent, ShootEvent, StatsPacket, TeamId, WeaponId } from '@shared/types/network';
import { getPickupY, getPlayerSpawnY } from '@shared/utils/MapGeometry';

type JoinOptions = {
  nick?: string;
  team?: TeamId;
};

type PlayerRuntime = {
  inputWindowStartedAt: number;
  inputCount: number;
  lastShotAt: number;
  lastHitAt: number;
  lastExplodeAt: number;
  lastPickupAt: number;
  pendingExplosives: {
    grenade: number;
    rpg: number;
  };
  baseDamageAccumulator: number;
  ignoreInputUntil: number;
  pickedDuringCurrentCrouch: boolean;
  lastDamageSourceId?: string;
};

const VALID_TEAMS: TeamId[] = [TEAM.RED, TEAM.BLUE];

export class GameRoom extends Room<RoomState> {
  maxClients = 20;
  private readonly runtime = new Map<string, PlayerRuntime>();
  private readonly admins = new Set<string>();
  private phaseSecondAccumulator = 0;

  onCreate(): void {
    this.setState(new RoomState());
    this.state.mapSeed = Date.now() % 1000000;
    this.createInitialPickups();
    this.setSimulationInterval(() => this.tick(), NETWORK.TICK_MS);
    this.onMessage('input', (client, data: InputCommand) => this.handleInput(client, data));
    this.onMessage('hit', (client, data: HitEvent) => this.handleHit(client, data));
    this.onMessage('shoot', (client, data: ShootEvent) => this.handleShoot(client, data));
    this.onMessage('explode', (client, data: ExplosionEvent) => this.handleExplosion(client, data));
    this.onMessage('pickup', (client, data: PickupEvent) => this.handlePickup(client, data));
    this.onMessage('admin_auth', (client, data: AdminAuthEvent) => this.handleAdminAuth(client, data));
    this.onMessage('admin_cmd', (client, data: AdminCommandEvent) => this.handleAdminCommand(client, data));
    console.log('GameRoom created');
  }

  onJoin(client: Client, options: JoinOptions): void {
    const nick = this.sanitizeNick(options.nick);
    const requestedTeam = VALID_TEAMS.indexOf(options.team as TeamId) >= 0 ? (options.team as TeamId) : TEAM.RED;
    const team = this.state.autoBalance ? this.getBalancedTeam(requestedTeam) : requestedTeam;
    const player = new PlayerSchema();

    player.id = client.sessionId;
    player.nick = nick;
    player.team = team;
    this.spawnAtBase(player);
    this.state.players.set(client.sessionId, player);
    this.runtime.set(client.sessionId, {
      inputWindowStartedAt: Date.now(),
      inputCount: 0,
      lastShotAt: 0,
      lastHitAt: 0,
      lastExplodeAt: 0,
      lastPickupAt: 0,
      pendingExplosives: {
        grenade: 0,
        rpg: 0
      },
      baseDamageAccumulator: 0,
      ignoreInputUntil: 0,
      pickedDuringCurrentCrouch: false,
      lastDamageSourceId: undefined
    });

    console.log(`Player joined: ${nick} (${team}) [${client.sessionId}]`);
    this.broadcastEvent({ type: 'chat', message: `${nick} joined ${team}` });
    if (this.state.phase === 'lobby') {
      this.startFight(false);
    }
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.runtime.delete(client.sessionId);
    this.admins.delete(client.sessionId);
    console.log(`Player left: ${client.sessionId}`);
  }

  private tick(): void {
    this.state.serverTick++;
    this.updateMatchTimer();

    if (this.state.phase !== 'fight') {
      return;
    }

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

    if (!player || !runtime || this.state.phase !== 'fight' || Date.now() < runtime.ignoreInputUntil || !this.acceptInput(runtime)) {
      return;
    }

    player.lastInputTick = this.clampNumber(data.tick, 0, Number.MAX_SAFE_INTEGER);
    player.crouch = Boolean(data.crouch);
    if (!player.crouch) {
      runtime.pickedDuringCurrentCrouch = false;
    }
    player.x = this.clampNumber(data.x, 0, MAP.WIDTH);
    player.y = this.clampNumber(data.y, 0, MAP.HEIGHT);
    player.vx = this.clampNumber(data.vx, -1200, 1200);
    player.vy = this.clampNumber(data.vy, -1400, 1400);
    player.aimAngle = this.clampNumber(data.aimAngle, -Math.PI, Math.PI);
  }

  private handleHit(client: Client, data: HitEvent): void {
    const attacker = this.state.players.get(client.sessionId);
    const target = this.state.players.get(data.targetId);
    const runtime = this.runtime.get(client.sessionId);
    const now = Date.now();

    if (!attacker || !target || !runtime || this.state.phase !== 'fight' || target.ghost || attacker.ghost || !this.isValidHitPayload(data)) {
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
    const targetRuntime = this.runtime.get(target.id);
    if (targetRuntime) {
      targetRuntime.lastDamageSourceId = attacker.id;
    }
    target.hp = Math.max(0, target.hp - this.normalizeDamage(data.damage));
    console.log(`Hit validated: ${client.sessionId} -> ${data.targetId}`);
    console.log(`Damage applied: ${target.hp} HP left`);
    this.broadcastEvent({ type: 'hit', targetId: target.id, hp: target.hp });

    if (target.hp <= 0) {
      this.kill(target, attacker.id);
    }
  }

  private handleShoot(client: Client, data: ShootEvent): void {
    const player = this.state.players.get(client.sessionId);
    const runtime = this.runtime.get(client.sessionId);
    const now = Date.now();

    if (!player || !runtime || this.state.phase !== 'fight' || player.ghost || !this.isShootWeapon(data.weapon)) {
      return;
    }

    if (player.weapon !== data.weapon || now - runtime.lastShotAt < NETWORK.HIT_RATE_LIMIT_MS || !this.consumeAmmo(player)) {
      return;
    }

    if (data.weapon === 'grenade' || data.weapon === 'rpg') {
      runtime.pendingExplosives[data.weapon]++;
    }

    runtime.lastShotAt = now;
  }

  private handleExplosion(client: Client, data: ExplosionEvent): void {
    const owner = this.state.players.get(client.sessionId);
    const runtime = this.runtime.get(client.sessionId);
    const now = Date.now();

    if (!owner || !runtime || this.state.phase !== 'fight' || (data.weapon !== 'grenade' && data.weapon !== 'rpg')) {
      return;
    }

    if (now - runtime.lastExplodeAt < 120 || runtime.pendingExplosives[data.weapon] <= 0) {
      return;
    }

    const x = this.clampNumber(data.x, 0, MAP.WIDTH);
    const y = this.clampNumber(data.y, 0, MAP.HEIGHT);
    const radius = data.weapon === 'rpg' ? GAME_CONFIG.WEAPONS.EXPLOSION.RPG_RADIUS : GAME_CONFIG.WEAPONS.EXPLOSION.GRENADE_RADIUS;
    const knockback = data.weapon === 'rpg' ? GAME_CONFIG.WEAPONS.EXPLOSION.RPG_KNOCKBACK : GAME_CONFIG.WEAPONS.EXPLOSION.GRENADE_KNOCKBACK;
    const damage = data.weapon === 'rpg' ? WEAPONS.RPG.damage : WEAPONS.GRENADE.damage;

    runtime.pendingExplosives[data.weapon]--;
    runtime.lastExplodeAt = now;
    this.state.players.forEach((player) => {
      if (player.id === owner.id || player.ghost || player.team === owner.team) {
        return;
      }

      const distance = Math.hypot(player.x - x, player.y - y);
      if (distance <= radius) {
        player.hp = Math.max(0, player.hp - damage);
        const playerRuntime = this.runtime.get(player.id);
        if (playerRuntime) {
          playerRuntime.lastDamageSourceId = owner.id;
        }
        this.broadcastEvent({ type: 'hit', targetId: player.id, hp: player.hp });
        if (player.hp <= 0) {
          this.kill(player, owner.id);
        }
      }
    });

    this.broadcastEvent({
      type: 'explode',
      ownerId: owner.id,
      x,
      y,
      radius,
      knockback,
      damage
    });
  }

  private handlePickup(client: Client, data: PickupEvent): void {
    const player = this.state.players.get(client.sessionId);
    const runtime = this.runtime.get(client.sessionId);
    const pickup = data && typeof data.pickupId === 'string'
      ? this.state.pickups.get(data.pickupId)
      : undefined;
    const now = Date.now();

    if (!player || !runtime || !pickup || this.state.phase !== 'fight' || player.ghost || runtime.pickedDuringCurrentCrouch) {
      return;
    }

    const crouching = player.crouch || Boolean(data.crouch);
    if (!crouching) {
      return;
    }

    if (now - runtime.lastPickupAt < GAME.PICKUP_COOLDOWN) {
      return;
    }

    const distance = Math.hypot(player.x - pickup.x, player.y - pickup.y);
    if (distance > GAME_CONFIG.WEAPONS.PICKUP_RADIUS) {
      return;
    }

    const previousWeapon = player.weapon as WeaponId;
    const previousAmmo = player.ammo;
    player.weapon = pickup.weapon;
    player.ammo = pickup.ammo;
    this.state.pickups.delete(pickup.id);

    if (previousWeapon !== 'fist' && previousAmmo > 0) {
      this.addPickup(previousWeapon, previousAmmo, pickup.x, pickup.y);
    }

    runtime.lastPickupAt = now;
    runtime.pickedDuringCurrentCrouch = true;
    this.broadcastEvent({
      type: 'pickup',
      targetId: player.id,
      weapon: player.weapon as WeaponId,
      ammo: player.ammo
    });
  }

  private updateGhost(player: PlayerSchema): void {
    player.ghostTimer = Math.max(0, player.ghostTimer - NETWORK.TICK_MS / 1000);

    if (player.ghostTimer <= 0) {
      this.spawnAtBase(player);
      const runtime = this.runtime.get(player.id);
      if (runtime) {
        runtime.ignoreInputUntil = Date.now() + 200;
      }
      this.broadcastRespawn(player);
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
      this.kill(player, undefined, 'environment');
    }
  }

  private kill(player: PlayerSchema, attackerId?: string, cause: 'player' | 'environment' = 'player'): void {
    if (player.ghost) {
      return;
    }

    this.recordDeath(player, attackerId, cause);
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
    player.y = getPlayerSpawnY(this.state.mapSeed, player.x);
    player.vx = 0;
    player.vy = 0;
    player.lastInputTick = 0;
    player.aimAngle = 0;
    player.hp = GAME.MAX_HP;
    player.ghost = false;
    player.ghostTimer = 0;
    player.crouch = false;
    player.weapon = 'pistol';
    player.ammo = WEAPONS.PISTOL.ammo;
    const runtime = this.runtime.get(player.id);
    if (runtime) {
      runtime.lastDamageSourceId = undefined;
      runtime.baseDamageAccumulator = 0;
      runtime.pendingExplosives.grenade = 0;
      runtime.pendingExplosives.rpg = 0;
      runtime.pickedDuringCurrentCrouch = false;
    }
  }

  private updateMatchTimer(): void {
    if (this.state.phase === 'lobby') {
      return;
    }

    this.phaseSecondAccumulator += NETWORK.TICK_MS;
    if (this.phaseSecondAccumulator < 1000) {
      return;
    }

    this.phaseSecondAccumulator -= 1000;
    this.state.phaseTimer = Math.max(0, this.state.phaseTimer - 1);

    if (this.state.phase === 'fight' && this.state.phaseTimer <= 0) {
      this.startPause();
    } else if (this.state.phase === 'pause' && this.state.phaseTimer <= 0) {
      this.startFight(true);
    }
  }

  private startFight(resetMatch: boolean): void {
    if (resetMatch) {
      this.resetMatchState();
    }

    this.state.phase = 'fight';
    this.state.phaseTimer = MATCH_PHASES.FIGHT_DURATION_SECONDS;
    this.phaseSecondAccumulator = 0;
    this.broadcastEvent({
      type: 'phase_change',
      phase: 'fight',
      timer: this.state.phaseTimer,
      redScore: this.state.redScore,
      blueScore: this.state.blueScore
    });
  }

  private startPause(): void {
    const stats = this.createStatsPacket();
    this.state.phase = 'pause';
    this.state.phaseTimer = MATCH_PHASES.PAUSE_DURATION_SECONDS;
    this.phaseSecondAccumulator = 0;
    this.broadcastEvent({
      type: 'phase_change',
      phase: 'pause',
      timer: this.state.phaseTimer,
      redScore: this.state.redScore,
      blueScore: this.state.blueScore,
      winner: stats.winner,
      stats
    });
    this.broadcastEvent({ type: 'stats', stats });
  }

  private resetMatchState(): void {
    this.state.mapSeed = Date.now() % 1000000;
    this.state.redScore = 0;
    this.state.blueScore = 0;
    this.state.pickups.clear();
    this.createInitialPickups();
    this.state.players.forEach((player) => {
      player.kills = 0;
      player.deaths = 0;
      this.spawnAtBase(player);
      this.broadcastRespawn(player);
    });
  }

  private broadcastRespawn(player: PlayerSchema): void {
    this.broadcastEvent({
      type: 'respawn',
      targetId: player.id,
      hp: player.hp,
      ghostTimer: player.ghostTimer,
      x: player.x,
      y: player.y,
      weapon: player.weapon as WeaponId,
      ammo: player.ammo
    });
  }

  private recordDeath(victim: PlayerSchema, attackerId?: string, cause: 'player' | 'environment' = 'player'): void {
    victim.deaths++;
    const victimRuntime = this.runtime.get(victim.id);
    const creditedAttackerId = attackerId || (cause === 'environment' ? victimRuntime?.lastDamageSourceId : undefined);
    const attacker = creditedAttackerId ? this.state.players.get(creditedAttackerId) : undefined;

    if (attacker && attacker.team !== victim.team && !attacker.ghost) {
      attacker.kills++;
      this.addTeamScore(attacker.team);
    } else if (cause === 'environment') {
      this.addTeamScore(victim.team === TEAM.RED ? TEAM.BLUE : TEAM.RED);
    }

    this.broadcastEvent({
      type: 'stats',
      redScore: this.state.redScore,
      blueScore: this.state.blueScore,
      stats: this.createStatsPacket()
    });
  }

  private addTeamScore(team: TeamId): void {
    if (team === TEAM.RED) {
      this.state.redScore++;
    } else {
      this.state.blueScore++;
    }
  }

  private createStatsPacket(): StatsPacket {
    const players = Array.from(this.state.players.values()).map((player) => ({
      id: player.id,
      nick: player.nick,
      team: player.team as TeamId,
      kills: player.kills,
      deaths: player.deaths,
      kpd: player.kills - player.deaths
    })).sort((a, b) => b.kpd - a.kpd || b.kills - a.kills || a.deaths - b.deaths);
    const winner = this.state.redScore === this.state.blueScore
      ? 'draw'
      : this.state.redScore > this.state.blueScore ? TEAM.RED : TEAM.BLUE;

    return {
      redScore: this.state.redScore,
      blueScore: this.state.blueScore,
      winner,
      players
    };
  }

  private handleAdminAuth(client: Client, data: AdminAuthEvent): void {
    const password = data && typeof data.password === 'string' ? data.password : '';
    if (password !== ADMIN_CONFIG.PASSWORD) {
      this.broadcastEvent({ type: 'admin', targetId: client.sessionId, message: 'auth_failed' });
      return;
    }

    this.admins.add(client.sessionId);
    this.broadcastEvent({
      type: 'admin',
      targetId: client.sessionId,
      message: 'granted',
      autoBalance: this.state.autoBalance
    });
  }

  private handleAdminCommand(client: Client, data: AdminCommandEvent): void {
    if (!this.admins.has(client.sessionId) || !data) {
      return;
    }

    const player = this.state.players.get(client.sessionId);
    const nick = player ? player.nick : client.sessionId;
    if (data.type === 'restart') {
      this.startFight(true);
      this.broadcastEvent({ type: 'chat', message: `[ADMIN] Match restarted by ${nick}` });
    } else if (data.type === 'toggle_balance') {
      this.state.autoBalance = !this.state.autoBalance;
      this.broadcastEvent({
        type: 'admin',
        message: 'balance_toggled',
        autoBalance: this.state.autoBalance
      });
      this.broadcastEvent({ type: 'chat', message: `[ADMIN] Auto balance ${this.state.autoBalance ? 'enabled' : 'disabled'} by ${nick}` });
    }
  }

  private getBalancedTeam(requestedTeam: TeamId): TeamId {
    const redCount = this.countTeam(TEAM.RED);
    const blueCount = this.countTeam(TEAM.BLUE);
    const requestedRedCount = redCount + (requestedTeam === TEAM.RED ? 1 : 0);
    const requestedBlueCount = blueCount + (requestedTeam === TEAM.BLUE ? 1 : 0);

    if (Math.abs(requestedRedCount - requestedBlueCount) <= 1) {
      return requestedTeam;
    }

    return redCount > blueCount ? TEAM.BLUE : TEAM.RED;
  }

  private countTeam(team: TeamId): number {
    let count = 0;
    this.state.players.forEach((player) => {
      if (player.team === team) {
        count++;
      }
    });
    return count;
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

  private consumeAmmo(player: PlayerSchema): boolean {
    if (player.weapon === 'fist') {
      return true;
    }

    if (player.ammo <= 0) {
      this.switchToFist(player);
      return false;
    }

    player.ammo--;
    if (player.ammo <= 0) {
      this.switchToFist(player);
    } else {
      this.broadcastEvent({
        type: 'ammo',
        targetId: player.id,
        weapon: player.weapon as WeaponId,
        ammo: player.ammo
      });
    }

    return true;
  }

  private switchToFist(player: PlayerSchema): void {
    player.weapon = 'fist';
    player.ammo = -1;
    this.broadcastEvent({
      type: 'pickup',
      targetId: player.id,
      weapon: 'fist',
      ammo: -1
    });
  }

  private createInitialPickups(): void {
    const weapons: WeaponId[] = ['auto', 'grenade', 'rpg', 'pistol', 'auto', 'grenade', 'pistol', 'rpg'];
    const spacing = MAP.WIDTH / (weapons.length + 1);

    weapons.forEach((weapon, index) => {
      const x = Math.round(spacing * (index + 1));
      this.addPickup(weapon, this.getDefaultAmmo(weapon), x, getPickupY(this.state.mapSeed, x));
    });
  }

  private addPickup(weapon: WeaponId, ammo: number, x: number, y: number): void {
    const pickup = new WeaponPickupSchema();
    pickup.id = `pickup_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    pickup.weapon = weapon;
    pickup.ammo = ammo;
    pickup.x = x;
    pickup.y = y;
    this.state.pickups.set(pickup.id, pickup);
  }

  private getDefaultAmmo(weapon: WeaponId): number {
    if (weapon === 'auto') {
      return WEAPONS.AUTO.ammo;
    }
    if (weapon === 'grenade') {
      return WEAPONS.GRENADE.ammo;
    }
    if (weapon === 'rpg') {
      return WEAPONS.RPG.ammo;
    }
    if (weapon === 'fist') {
      return -1;
    }
    return WEAPONS.PISTOL.ammo;
  }

  private isShootWeapon(weapon: string): weapon is Exclude<WeaponId, 'fist'> {
    return weapon === 'pistol' || weapon === 'auto' || weapon === 'grenade' || weapon === 'rpg';
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
