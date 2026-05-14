import { Client, Room } from '@colyseus/core';
import { GAME, GAME_CONFIG, MAP, NETWORK, TEAM, WEAPONS } from '@shared/constants';
import { PlayerSchema } from '@shared/schemas/PlayerSchema';
import { RoomState } from '@shared/schemas/RoomState';
import { WeaponPickupSchema } from '@shared/schemas/WeaponPickupSchema';
import { ExplosionEvent, GameEventPayload, HitEvent, InputCommand, PickupEvent, ShootEvent, TeamId, WeaponId } from '@shared/types/network';
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
};

const VALID_TEAMS: TeamId[] = [TEAM.RED, TEAM.BLUE];

export class GameRoom extends Room<RoomState> {
  maxClients = 20;
  private readonly runtime = new Map<string, PlayerRuntime>();

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
      pickedDuringCurrentCrouch: false
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

  private handleShoot(client: Client, data: ShootEvent): void {
    const player = this.state.players.get(client.sessionId);
    const runtime = this.runtime.get(client.sessionId);
    const now = Date.now();

    if (!player || !runtime || player.ghost || !this.isShootWeapon(data.weapon)) {
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

    if (!owner || !runtime || (data.weapon !== 'grenade' && data.weapon !== 'rpg')) {
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
        this.broadcastEvent({ type: 'hit', targetId: player.id, hp: player.hp });
        if (player.hp <= 0) {
          this.kill(player);
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

    if (!player || !runtime || !pickup || player.ghost || runtime.pickedDuringCurrentCrouch) {
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
    player.y = getPlayerSpawnY(this.state.mapSeed, player.x);
    player.vx = 0;
    player.vy = 0;
    player.hp = GAME.MAX_HP;
    player.ghost = false;
    player.ghostTimer = 0;
    player.crouch = false;
    player.weapon = 'pistol';
    player.ammo = WEAPONS.PISTOL.ammo;
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
