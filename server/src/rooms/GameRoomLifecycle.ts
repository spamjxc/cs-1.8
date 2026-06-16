// @ts-nocheck
import { Client, Room } from '@colyseus/core';
import { ADMIN_CONFIG, GAME, MAP, MATCH_PHASES, NETWORK, TEAM, THEME_LIST, WEAPONS } from '@shared/constants';
import { PlayerSchema } from '@shared/schemas/PlayerSchema';
import { RoomState } from '@shared/schemas/RoomState';
import { AdminAuthEvent, AdminCommandEvent, GameEventPayload, StatsPacket, TeamId, WeaponId } from '@shared/types/network';
import { getPlayerSpawnY } from '@shared/utils/MapGeometry';
import { loadRuntimeConfig } from '../runtimeConfig';

export abstract class GameRoomLifecycle extends Room<RoomState> {
  protected updateGhost(player: PlayerSchema): void {
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

  protected applyBaseDamage(player: PlayerSchema): void {
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

  protected kill(player: PlayerSchema, attackerId?: string, cause: 'player' | 'environment' = 'player'): void {
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

  protected spawnAtBase(player: PlayerSchema): void {
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

  protected updateMatchTimer(): void {
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

  protected startFight(resetMatch: boolean): void {
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

  protected startPause(): void {
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

  protected resetMatchState(): void {
    this.state.mapSeed = Date.now() % 1000000;
    this.rotateTheme();
    this.state.redScore = 0;
    this.state.blueScore = 0;
    this.lootSpawnAccumulator = 0;
    this.state.pickups.clear();
    this.createInitialPickups();
    this.state.players.forEach((player) => {
      player.kills = 0;
      player.deaths = 0;
      this.spawnAtBase(player);
      this.broadcastRespawn(player);
    });
  }

  protected broadcastRespawn(player: PlayerSchema): void {
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

  protected recordDeath(victim: PlayerSchema, attackerId?: string, cause: 'player' | 'environment' = 'player'): void {
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

  protected addTeamScore(team: TeamId): void {
    if (team === TEAM.RED) {
      this.state.redScore++;
    } else {
      this.state.blueScore++;
    }
  }

  protected createStatsPacket(): StatsPacket {
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

  protected handleAdminAuth(client: Client, data: AdminAuthEvent): void {
    const password = data && typeof data.password === 'string' ? data.password : '';
    if (password !== this.getAdminPassword()) {
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

  protected getAdminPassword(): string {
    const runtimePassword = loadRuntimeConfig().admin.password;
    return runtimePassword || ADMIN_CONFIG.PASSWORD;
  }

  protected handleAdminCommand(client: Client, data: AdminCommandEvent): void {
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
      this.updateRoomMetadata();
      this.broadcastEvent({
        type: 'admin',
        message: 'balance_toggled',
        autoBalance: this.state.autoBalance
      });
      this.broadcastEvent({ type: 'chat', message: `[ADMIN] Auto balance ${this.state.autoBalance ? 'enabled' : 'disabled'} by ${nick}` });
    } else if (data.type === 'change_theme') {
      this.rotateTheme();
      this.broadcastEvent({ type: 'chat', message: `[ADMIN] Theme changed to ${this.state.mapTheme.toUpperCase()} by ${nick}` });
    }
  }

  protected updateRoomMetadata(): void {
    this.setMetadata({
      autoBalance: this.state.autoBalance,
      redCount: this.countTeam(TEAM.RED),
      blueCount: this.countTeam(TEAM.BLUE)
    });
  }

  protected rotateTheme(): void {
    const current = this.state.mapTheme as Theme;
    const available = THEME_LIST.filter(t => t !== current);
    const next = available[Math.floor(Math.random() * available.length)];
    this.state.mapTheme = next;
    console.log(`Theme rotated: ${current} -> ${next}`);
  }

  protected getBalancedTeam(requestedTeam: TeamId): TeamId {
    const redCount = this.countTeam(TEAM.RED);
    const blueCount = this.countTeam(TEAM.BLUE);
    const requestedRedCount = redCount + (requestedTeam === TEAM.RED ? 1 : 0);
    const requestedBlueCount = blueCount + (requestedTeam === TEAM.BLUE ? 1 : 0);

    if (Math.abs(requestedRedCount - requestedBlueCount) <= 1) {
      return requestedTeam;
    }

    return redCount > blueCount ? TEAM.BLUE : TEAM.RED;
  }

  protected countTeam(team: TeamId): number {
    let count = 0;
    this.state.players.forEach((player) => {
      if (player.team === team) {
        count++;
      }
    });
    return count;
  }

}
