// @ts-nocheck
import * as Phaser from 'phaser';
import { GAME, GAME_CONFIG, MAP, TEAM, WEAPONS } from '@shared/constants';
import { MapBuilder } from '@client/entities/MapBuilder';
import { getPlayerSpawnY } from '@shared/utils/MapGeometry';
import { NetworkManager } from '@client/systems/NetworkManager';
import { Interpolator } from '@client/utils/Interpolator';
import type { GameEventPayload } from '@shared/types/network';
import { ANIMATION_KEYS, SPRITE_KEYS, WEAPON_POSE_KEYS } from './GameSceneConfig';
import { GameSceneNetwork } from './GameSceneNetwork';

export abstract class GameSceneHud extends GameSceneNetwork {
  protected updateHud(): void {
    const inEnemyBase = this.isLocalInEnemyBase();
    const baseWarningConfig = GAME_CONFIG.BASES;
    const baseWarningRange = baseWarningConfig.DAMAGE_WARNING_MAX_ALPHA - baseWarningConfig.DAMAGE_WARNING_MIN_ALPHA;
    const baseWarningPulse = (Math.sin(this.time.now / baseWarningConfig.DAMAGE_WARNING_BLINK_MS) + 1) / 2;

    this.hpText?.setText(`HP ${Math.ceil(this.localHp)} | ${this.getWeaponLabel()} ${this.getAmmoLabel()}`);
    this.ghostText?.setText(this.localGhost ? `Призрак ${Math.ceil(this.getLocalGhostTimer())}s` : '');
    this.updateHudOverlay();
    this.baseWarning?.setAlpha(inEnemyBase && !this.localGhost
      ? baseWarningConfig.DAMAGE_WARNING_MIN_ALPHA + baseWarningPulse * baseWarningRange
      : 0);
  }

  protected createHudOverlay(): void {
    const container = document.getElementById('game-container');
    if (!container) {
      return;
    }

    this.hudElement = document.createElement('div');
    this.hudElement.style.position = 'absolute';
    this.hudElement.style.left = '12px';
    this.hudElement.style.top = '12px';
    this.hudElement.style.zIndex = '20';
    this.hudElement.style.pointerEvents = 'none';
    this.hudElement.style.padding = '7px 10px';
    this.hudElement.style.border = '1px solid rgba(232, 243, 208, 0.35)';
    this.hudElement.style.background = 'rgba(8, 12, 9, 0.72)';
    this.hudElement.style.color = '#e8f3d0';
    this.hudElement.style.font = '700 14px Arial, sans-serif';
    this.hudElement.style.lineHeight = '18px';
    this.hudElement.style.textShadow = '0 1px 1px #000';
    container.appendChild(this.hudElement);
    this.updateHudOverlay();
  }

  protected updateHudOverlay(): void {
    if (!this.hudElement) {
      return;
    }

    const ghostLine = this.localGhost ? `<div style="color:#f1d27a">Призрак ${Math.ceil(this.getLocalGhostTimer())}s</div>` : '';
    const phaseLabel = this.phase === 'fight' ? 'Бой' : this.phase === 'pause' ? 'Пауза' : 'Лобби';
    this.hudElement.innerHTML = [
      `<div>${phaseLabel} ${this.formatTime(this.phaseTimer)}</div>`,
      `<div><span style="color:#ff8a8a">R ${this.redScore}</span> : <span style="color:#86b7ff">B ${this.blueScore}</span></div>`,
      `<div>HP ${Math.ceil(this.localHp)}</div>`,
      `<div>${this.getWeaponLabel()} ${this.getAmmoLabel()}</div>`,
      ghostLine
    ].join('');
  }

  protected destroyHudOverlay(): void {
    this.hudElement?.remove();
    this.hudElement = undefined;
    this.statsElement?.remove();
    this.statsElement = undefined;
    this.adminElement?.remove();
    this.adminElement = undefined;
    this.adminModalElement?.remove();
    this.adminModalElement = undefined;
    this.chatElement?.remove();
    this.chatElement = undefined;
  }

  protected createStatsOverlay(): void {
    const container = document.getElementById('game-container');
    if (!container) {
      return;
    }

    this.statsElement = document.createElement('div');
    this.statsElement.style.position = 'absolute';
    this.statsElement.style.left = '50%';
    this.statsElement.style.top = '50%';
    this.statsElement.style.transform = 'translate(-50%, -50%)';
    this.statsElement.style.width = 'min(720px, calc(100vw - 32px))';
    this.statsElement.style.maxHeight = 'min(620px, calc(100vh - 32px))';
    this.statsElement.style.overflow = 'auto';
    this.statsElement.style.zIndex = '30';
    this.statsElement.style.display = 'none';
    this.statsElement.style.padding = '18px';
    this.statsElement.style.border = '1px solid rgba(232, 243, 208, 0.34)';
    this.statsElement.style.background = 'rgba(8, 12, 9, 0.9)';
    this.statsElement.style.color = '#e8f3d0';
    this.statsElement.style.font = '14px Arial, sans-serif';
    container.appendChild(this.statsElement);
  }

  protected updateStatsOverlay(): void {
    if (!this.statsElement) {
      return;
    }

    if (this.phase !== 'pause') {
      this.statsElement.style.display = 'none';
      return;
    }

    const stats = this.lastStats || {
      redScore: this.redScore,
      blueScore: this.blueScore,
      winner: this.redScore === this.blueScore ? 'draw' : this.redScore > this.blueScore ? TEAM.RED : TEAM.BLUE,
      players: this.collectStatsRows()
    };
    const winnerLabel = stats.winner === 'draw' ? 'Ничья' : stats.winner === TEAM.RED ? 'Красные' : 'Синие';
    const localId = this.network?.getSessionId();
    const rows = stats.players.map((player) => {
      const highlight = player.id === localId ? 'background:rgba(255,215,0,0.25);font-weight:700;' : '';
      const teamColor = player.team === TEAM.RED ? '#ff8a8a' : '#86b7ff';
      return `<tr style="${highlight}"><td>${this.escapeHtml(player.nick)}</td><td style="color:${teamColor}">${player.team}</td><td>${player.kills}</td><td>${player.deaths}</td><td>${player.kpd}</td></tr>`;
    }).join('');

    this.statsElement.style.display = 'block';
    this.statsElement.innerHTML = `
      <div style="font-size:22px;font-weight:700;margin-bottom:8px;">${winnerLabel}</div>
      <div style="margin-bottom:14px;color:#cfe3bf;">Красные ${stats.redScore} : ${stats.blueScore} Синие · рестарт через ${this.formatTime(this.phaseTimer)}</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="text-align:left;color:#9fb394;"><th>Ник</th><th>Команда</th><th>Убийства</th><th>Смерти</th><th>КПД</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Нет игроков</td></tr>'}</tbody>
      </table>
    `;
  }

  protected collectStatsRows(): StatsPacket['players'] {
    const rows: StatsPacket['players'] = [];
    const players = (this.room?.state as any)?.players;

    if (!players) {
      return rows;
    }

    players.forEach((player: any, id: string) => {
      const kills = this.toFiniteNumber(player.kills, 0);
      const deaths = this.toFiniteNumber(player.deaths, 0);
      rows.push({
        id,
        nick: player.nick || 'Player',
        team: player.team === TEAM.BLUE ? TEAM.BLUE : TEAM.RED,
        kills,
        deaths,
        kpd: kills - deaths
      });
    });

    return rows.sort((a, b) => b.kpd - a.kpd || b.kills - a.kills || a.deaths - b.deaths);
  }

  protected createChatOverlay(): void {
    const container = document.getElementById('game-container');
    if (!container) {
      return;
    }

    this.chatElement = document.createElement('div');
    this.chatElement.style.position = 'absolute';
    this.chatElement.style.left = '12px';
    this.chatElement.style.bottom = '12px';
    this.chatElement.style.width = 'min(520px, calc(100vw - 24px))';
    this.chatElement.style.zIndex = '25';
    this.chatElement.style.pointerEvents = 'none';
    this.chatElement.style.color = '#dce8cc';
    this.chatElement.style.font = '12px Arial, sans-serif';
    this.chatElement.style.textShadow = '0 1px 1px #000';
    container.appendChild(this.chatElement);
  }

  protected addChatMessage(message: string): void {
    this.chatMessages.push(message);
    while (this.chatMessages.length > 5) {
      this.chatMessages.shift();
    }

    if (!this.chatElement) {
      return;
    }

    this.chatElement.innerHTML = this.chatMessages
      .map((line) => `<div>${this.escapeHtml(line)}</div>`)
      .join('');
  }

  protected formatTime(totalSeconds: number): string {
    const seconds = Math.max(0, Math.ceil(totalSeconds));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;

    return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
  }

  protected escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  protected toFiniteNumber(value: unknown, fallback: number): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
  }
}

