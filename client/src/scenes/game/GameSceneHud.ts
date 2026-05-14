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

    this.hpText?.setText('');
    this.ghostText?.setText('');
    this.updateHudOverlay();
    this.applyHudResponsiveLayout();
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
    this.hudElement.style.padding = '9px 12px';
    this.hudElement.style.border = '2px solid rgba(128, 150, 96, 0.72)';
    this.hudElement.style.borderRadius = '3px';
    this.hudElement.style.background = 'rgba(8, 12, 9, 0.82)';
    this.hudElement.style.color = '#e8f3d0';
    this.hudElement.style.font = '700 14px Arial, sans-serif';
    this.hudElement.style.lineHeight = '20px';
    this.hudElement.style.textShadow = '0 1px 1px #000';
    this.hudElement.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.7), inset 0 0 18px rgba(97, 128, 67, 0.16)';
    this.hudElement.style.minWidth = '218px';
    this.hudElement.style.transformOrigin = 'top left';
    container.appendChild(this.hudElement);
    this.updateHudOverlay();

    this.timerElement = document.createElement('div');
    this.timerElement.style.position = 'absolute';
    this.timerElement.style.left = '50%';
    this.timerElement.style.bottom = '14px';
    this.timerElement.style.transform = 'translateX(-50%)';
    this.timerElement.style.transformOrigin = 'bottom center';
    this.timerElement.style.zIndex = '22';
    this.timerElement.style.pointerEvents = 'none';
    this.timerElement.style.display = 'flex';
    this.timerElement.style.gap = '12px';
    this.timerElement.style.alignItems = 'center';
    this.timerElement.style.justifyContent = 'center';
    this.timerElement.style.font = '900 24px Arial, sans-serif';
    this.timerElement.style.color = '#e8f3d0';
    this.timerElement.style.textShadow = '0 2px 2px #000';
    container.appendChild(this.timerElement);
    this.updateTimerOverlay();
    this.applyHudResponsiveLayout();
  }

  protected updateHudOverlay(): void {
    if (!this.hudElement) {
      return;
    }

    this.updateTimerOverlay();
    const hp = Phaser.Math.Clamp(Math.ceil(this.localHp), 0, GAME.MAX_HP);
    const hpRatio = Phaser.Math.Clamp(hp / GAME.MAX_HP, 0, 1);
    const hpColor = hpRatio > 0.55 ? '#9bdc4a' : hpRatio > 0.25 ? '#f1d27a' : '#ff8a8a';

    this.hudElement.innerHTML = `
      <div style="display:grid;grid-template-columns:74px 1fr;column-gap:10px;row-gap:6px;align-items:center;">
        <div style="color:#9fb394;">Счёт</div>
        <div><span style="color:#ff8a8a">Красные ${this.redScore}</span> : <span style="color:#86b7ff">${this.blueScore} Синие</span></div>
        <div style="color:#9fb394;">HP</div>
        <div style="display:grid;grid-template-columns:42px minmax(86px,1fr);gap:8px;align-items:center;">
          <span style="color:#e8f3d0;text-align:right;padding-right:3px;">${hp}</span>
          <span style="display:block;width:100%;height:8px;background:#1b1f1c;border:1px solid #e8f3d0;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.72);">
            <span style="display:block;width:${Math.round(hpRatio * 100)}%;height:100%;background:${hpColor};"></span>
          </span>
        </div>
        <div style="color:#9fb394;">Оружие</div>
        <div style="color:#e8f3d0;white-space:nowrap;text-align:left;">${this.getWeaponLabel()}</div>
        <div style="color:#9fb394;">Боезапас</div>
        <div style="color:#e8f3d0;text-align:left;">${this.getAmmoLabel()}</div>
      </div>
    `;
  }

  protected updateTimerOverlay(): void {
    if (!this.timerElement) {
      return;
    }

    const phaseLabel = this.phase === 'fight' ? 'Бой' : this.phase === 'pause' ? 'Пауза' : 'Лобби';
    const ghostLine = this.localGhost
      ? `<span style="color:#f1d27a;border:2px solid rgba(241,210,122,0.55);background:rgba(13,17,14,0.8);padding:6px 10px;">Призрак ${Math.ceil(this.getLocalGhostTimer())}s</span>`
      : '';

    this.timerElement.innerHTML = `
      <span style="border:2px solid rgba(128,150,96,0.72);background:rgba(8,12,9,0.82);padding:6px 12px;">${phaseLabel} ${this.formatTime(this.phaseTimer)}</span>
      ${ghostLine}
    `;
  }

  protected applyHudResponsiveLayout(): void {
    const scale = this.getHudUiScale();
    const mobile = this.isMobileViewport();
    const edge = mobile ? GAME_CONFIG.MOBILE.PANEL_EDGE_PX : 12;
    const bottomGap = mobile ? GAME_CONFIG.MOBILE.PANEL_BOTTOM_GAP_PX : 14;

    if (this.hudElement) {
      this.hudElement.style.left = `${edge}px`;
      this.hudElement.style.top = `${edge}px`;
      this.hudElement.style.transform = `scale(${scale})`;
    }

    if (this.timerElement) {
      this.timerElement.style.bottom = this.getBottomInsetCss(bottomGap);
      this.timerElement.style.transform = `translateX(-50%) scale(${scale})`;
    }

    if (this.statsElement) {
      this.statsElement.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }

    if (this.chatElement) {
      this.chatElement.style.left = `${edge}px`;
      this.chatElement.style.bottom = this.getBottomInsetCss(bottomGap);
      this.chatElement.style.transform = `scale(${scale})`;
    }
  }

  protected isMobileViewport(): boolean {
    const width = this.scale.width || window.innerWidth || 1280;
    const height = this.scale.height || window.innerHeight || 720;

    return width <= GAME_CONFIG.MOBILE.SMALL_SCREEN_WIDTH ||
      height <= GAME_CONFIG.MOBILE.SMALL_SCREEN_HEIGHT;
  }

  protected getHudUiScale(): number {
    return this.isMobileViewport()
      ? 1 / GAME_CONFIG.MOBILE.UI_SCALE_DIVISOR
      : 1;
  }

  protected getBottomInsetCss(basePixels: number): string {
    return `calc(${basePixels}px + env(safe-area-inset-bottom, 0px) + var(--radiation-browser-bottom-inset, 0px))`;
  }

  protected destroyHudOverlay(): void {
    this.hudElement?.remove();
    this.hudElement = undefined;
    this.timerElement?.remove();
    this.timerElement = undefined;
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
    this.statsElement.style.transformOrigin = 'center center';
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
    this.applyHudResponsiveLayout();
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
    const rows = stats.players.map((player, index) => {
      const highlight = player.id === localId ? 'background:rgba(255,215,0,0.25);font-weight:700;' : '';
      const teamColor = player.team === TEAM.RED ? '#ff8a8a' : '#86b7ff';
      const teamLabel = player.team === TEAM.RED ? 'Красные' : 'Синие';
      return `<tr style="${highlight}"><td>${index + 1}</td><td>${this.escapeHtml(player.nick)}</td><td style="color:${teamColor}">${teamLabel}</td><td>${player.kills}</td><td>${player.deaths}</td><td>${player.kpd}</td></tr>`;
    }).join('');

    this.statsElement.style.display = 'block';
    this.applyHudResponsiveLayout();
    this.statsElement.innerHTML = `
      <div style="font-size:22px;font-weight:700;margin-bottom:8px;">${winnerLabel}</div>
      <div style="margin-bottom:14px;color:#cfe3bf;">Красные ${stats.redScore} : ${stats.blueScore} Синие · рестарт через ${this.formatTime(this.phaseTimer)}</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="text-align:left;color:#9fb394;"><th>Место</th><th>Ник</th><th>Команда</th><th>Убийства</th><th>Смерти</th><th>КПД</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">Нет игроков</td></tr>'}</tbody>
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
    this.chatElement.style.transformOrigin = 'bottom left';
    container.appendChild(this.chatElement);
    this.applyHudResponsiveLayout();
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
