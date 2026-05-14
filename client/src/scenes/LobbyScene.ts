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
  private lobbyClient?: Client;
  private lobbyPoll?: Phaser.Time.TimerEvent;
  private gameSceneLoaded = false;

  constructor() {
    super('LobbyScene');
  }

  create(): void {
    this.add.rectangle(640, 360, 1280, 720, 0x1b211d);
    this.add.rectangle(640, 360, 1280, 720, 0x2f3b2f, 0.35);

    this.add.text(640, 150, 'CS 1.8 "Радиация"', {
      fontSize: '36px',
      color: '#e8f3d0',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5);

    this.add.text(640, 205, 'Локальная сеть, две команды, один бой', {
      fontSize: '18px',
      color: '#9fb394',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5);

    this.nickInput = this.add.dom(640, 285).createFromHTML(LOBBY_HTML);
    this.createTeamButtons();

    this.playButton = this.add.text(640, 430, 'Играть', {
      fontSize: '24px',
      color: '#101510',
      backgroundColor: '#9bdc4a',
      padding: { x: 28, y: 12 },
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.statusText = this.add.text(640, 490, '', {
      fontSize: '16px',
      color: '#f1d27a',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5);

    this.playButton.on('pointerdown', () => {
      this.joinGame();
    });

    void this.refreshLobbyBalance();
    this.lobbyPoll = this.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => void this.refreshLobbyBalance()
    });
  }

  private createTeamButtons(): void {
    this.redButton = this.add.text(560, 360, 'Красные', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#8a2f2f',
      padding: { x: 18, y: 10 },
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.blueButton = this.add.text(720, 360, 'Синие', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#2f568a',
      padding: { x: 18, y: 10 },
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.redButton.on('pointerdown', () => this.selectTeam(TEAM.RED));
    this.blueButton.on('pointerdown', () => this.selectTeam(TEAM.BLUE));
    this.selectTeam(this.selectedTeam);

    this.balanceText = this.add.text(640, 392, '', {
      fontSize: '15px',
      color: '#f1d27a',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5);
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
    this.balanceText?.setText(autoBalance ? 'Включена балансировка: команда будет назначена автоматически' : '');
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

  private async refreshLobbyBalance(): Promise<void> {
    try {
      if (!this.lobbyClient) {
        this.lobbyClient = new Client(await this.getWsEndpoint());
      }

      const rooms = await this.lobbyClient.getAvailableRooms('game_room');
      const firstRoom = rooms && rooms.length > 0 ? rooms[0] as any : undefined;
      const metadata = firstRoom ? firstRoom.metadata : undefined;
      this.setAutoBalance(Boolean(metadata && metadata.autoBalance));
    } catch (error) {
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
      const room = await client.joinOrCreate('game_room', {
        nick,
        team: this.selectedTeam
      });
      const assignedPlayer = (room.state as any)?.players?.get ? (room.state as any).players.get(room.sessionId) : undefined;
      const assignedTeam = assignedPlayer ? (assignedPlayer.team === TEAM.BLUE ? TEAM.BLUE : TEAM.RED) : this.selectedTeam;

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
