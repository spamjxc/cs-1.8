import * as Phaser from 'phaser';
import { Client, Room } from 'colyseus.js';
import { TEAM } from '@shared/constants';

type TeamId = typeof TEAM.RED | typeof TEAM.BLUE;

export type GameSceneData = {
  room?: Room;
  nick: string;
  team: TeamId;
};

const LOBBY_HTML = `
  <div class="lobby-panel">
    <input id="nick" class="lobby-input" placeholder="Ник" maxlength="12" autocomplete="off" />
  </div>
`;

export default class LobbyScene extends Phaser.Scene {
  private selectedTeam: TeamId = TEAM.RED;
  private nickInput?: Phaser.GameObjects.DOMElement;
  private redButton?: Phaser.GameObjects.Text;
  private blueButton?: Phaser.GameObjects.Text;
  private playButton?: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;
  private balanceText?: Phaser.GameObjects.Text;
  private autoBalance = false;
  private redCount = 0;
  private blueCount = 0;
  private lobbyClient?: Client;
  private lobbyPoll?: Phaser.Time.TimerEvent;
  private gameSceneLoaded = false;

  constructor() {
    super('LobbyScene');
  }

  create(): void {
    const width = this.scale.width || 1280;
    const height = this.scale.height || 720;
    const centerX = width / 2;
    const centerY = height / 2;
    const topY = Math.max(82, centerY - 210);
    const teamGap = Math.min(170, Math.max(132, width * 0.34));

    this.add.rectangle(centerX, centerY, width, height, 0x1b211d);
    this.add.rectangle(centerX, centerY, width, height, 0x2f3b2f, 0.35);

    this.add.text(centerX, topY, 'CS 1.8 "Радиация"', {
      fontSize: '36px',
      color: '#e8f3d0',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5);

    this.add.text(centerX, topY + 55, 'Локальная сеть, две команды, один бой', {
      fontSize: '18px',
      color: '#9fb394',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5);

    this.nickInput = this.add.dom(centerX, topY + 135).createFromHTML(LOBBY_HTML);
    this.createTeamButtons(centerX, topY + 210, teamGap);

    this.playButton = this.add.text(centerX, topY + 280, 'Играть', {
      fontSize: '24px',
      color: '#101510',
      backgroundColor: '#9bdc4a',
      padding: { x: 28, y: 12 },
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.statusText = this.add.text(centerX, topY + 340, '', {
      fontSize: '16px',
      color: '#f1d27a',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5);

    this.playButton.on('pointerdown', () => {
      this.joinGame();
    });

    void this.refreshLobbyBalance();
    this.lobbyPoll = this.time.addEvent({
      delay: 750,
      loop: true,
      callback: () => void this.refreshLobbyBalance()
    });
  }

  private createTeamButtons(centerX: number, y: number, gap: number): void {
    this.redButton = this.add.text(centerX - gap / 2, y, '', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#8a2f2f',
      padding: { x: 18, y: 10 },
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.blueButton = this.add.text(centerX + gap / 2, y, '', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#2f568a',
      padding: { x: 18, y: 10 },
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.redButton.on('pointerdown', () => this.selectTeam(TEAM.RED));
    this.blueButton.on('pointerdown', () => this.selectTeam(TEAM.BLUE));
    this.selectTeam(this.selectedTeam);

    this.balanceText = this.add.text(centerX, y + 36, '', {
      fontSize: '15px',
      color: '#f1d27a',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5);
    this.updateTeamLabels();
  }

  private selectTeam(team: TeamId): void {
    if (this.autoBalance) {
      return;
    }

    this.selectedTeam = team;
    this.redButton?.setAlpha(team === TEAM.RED ? 1 : 0.55);
    this.blueButton?.setAlpha(team === TEAM.BLUE ? 1 : 0.55);
  }

  private setAutoBalance(autoBalance: boolean): void {
    this.autoBalance = autoBalance;
    this.updateTeamLabels();
    [this.redButton, this.blueButton].forEach((button) => {
      if (!button) {
        return;
      }

      if (autoBalance) {
        button.disableInteractive();
        button.setAlpha(0.38);
        button.setStyle({
          color: '#8f9b88',
          backgroundColor: '#263025'
        });
      } else {
        button.setInteractive({ useHandCursor: true });
        button.setStyle({
          color: '#ffffff',
          backgroundColor: button === this.redButton ? '#8a2f2f' : '#2f568a'
        });
      }
    });

    if (!autoBalance) {
      this.selectTeam(this.selectedTeam);
    }
  }

  private updateTeamLabels(): void {
    this.redButton?.setText(`Красные ${this.redCount}`);
    this.blueButton?.setText(`Синие ${this.blueCount}`);
    this.balanceText?.setText(this.autoBalance
      ? `Автобаланс включён · будет назначена команда · ${this.redCount}:${this.blueCount}`
      : `В лобби: красные ${this.redCount}, синие ${this.blueCount}`);
  }

  private async refreshLobbyBalance(): Promise<void> {
    try {
      if (!this.lobbyClient) {
        this.lobbyClient = new Client(await this.getWsEndpoint());
      }

      const rooms = await this.lobbyClient.getAvailableRooms('game_room');
      const firstRoom = rooms && rooms.length > 0 ? rooms[0] as any : undefined;
      const metadata = firstRoom ? firstRoom.metadata : undefined;
      this.redCount = this.toCount(metadata && metadata.redCount);
      this.blueCount = this.toCount(metadata && metadata.blueCount);
      this.setAutoBalance(Boolean(metadata && metadata.autoBalance));
    } catch (error) {
      this.redCount = 0;
      this.blueCount = 0;
      this.setAutoBalance(false);
    }
  }

  private async joinGame(): Promise<void> {
    const nickInput = document.getElementById('nick') as HTMLInputElement | null;
    const nick = nickInput?.value.trim() || 'Player';

    this.statusText?.setText('Подключение к серверу...');
    this.playButton?.disableInteractive().setAlpha(0.6);

    try {
      const client = new Client(await this.getWsEndpoint());
      const predictedTeam = this.getPredictedJoinTeam();
      const room = await client.joinOrCreate('game_room', {
        nick,
        team: predictedTeam
      });
      const assignedTeam = await this.waitForAssignedTeam(room, predictedTeam);

      await this.startGameScene({
        room,
        nick,
        team: assignedTeam
      } as GameSceneData);
    } catch (error) {
      console.error('Join failed:', error);
      this.statusText?.setText('Сервер недоступен. Запускаю локально.');
      this.playButton?.setInteractive({ useHandCursor: true }).setAlpha(1);

      this.time.delayedCall(450, () => {
        void this.startGameScene({
          nick,
          team: this.selectedTeam
        } as GameSceneData);
      });
    }
  }

  private getPredictedJoinTeam(): TeamId {
    if (!this.autoBalance) {
      return this.selectedTeam;
    }

    const requestedRedCount = this.redCount + (this.selectedTeam === TEAM.RED ? 1 : 0);
    const requestedBlueCount = this.blueCount + (this.selectedTeam === TEAM.BLUE ? 1 : 0);

    if (Math.abs(requestedRedCount - requestedBlueCount) <= 1) {
      return this.selectedTeam;
    }

    return this.redCount > this.blueCount ? TEAM.BLUE : TEAM.RED;
  }

  private async waitForAssignedTeam(room: Room, fallback: TeamId): Promise<TeamId> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const assignedPlayer = (room.state as any)?.players?.get ? (room.state as any).players.get(room.sessionId) : undefined;
      if (assignedPlayer) {
        return assignedPlayer.team === TEAM.BLUE ? TEAM.BLUE : TEAM.RED;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }

    return fallback;
  }

  private toCount(value: unknown): number {
    const count = Number(value);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  }

  private async startGameScene(data: GameSceneData): Promise<void> {
    this.lobbyPoll?.remove(false);
    this.lobbyPoll = undefined;

    if (!this.gameSceneLoaded && !this.scene.get('GameScene')) {
      const module = await import('@client/scenes/GameScene');
      this.scene.add('GameScene', module.default, false);
    }

    this.gameSceneLoaded = true;
    this.scene.start('GameScene', data);
  }

  private async getWsEndpoint(): Promise<string> {
    const host = window.location.hostname || 'localhost';
    const fallbackPort = window.location.port || '3000';

    try {
      const response = await fetch('/runtime-config.json', {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`Runtime config HTTP ${response.status}`);
      }

      const config = await response.json();
      const websocket = config && config.websocket ? config.websocket : {};
      const protocol = websocket.protocol === 'wss' ? 'wss' : 'ws';
      const wsHost = typeof websocket.host === 'string' && websocket.host && websocket.host !== 'auto'
        ? websocket.host
        : host;
      const wsPort = Number(websocket.port) > 0 ? Number(websocket.port) : Number(fallbackPort);
      const path = typeof websocket.path === 'string' ? websocket.path : '';

      return `${protocol}://${wsHost}:${wsPort}${path}`;
    } catch (error) {
      console.warn('Runtime config unavailable, using current page host.', error);
      return `ws://${host}:${fallbackPort}`;
    }
  }
}
