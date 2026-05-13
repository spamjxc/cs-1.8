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
  }

  private selectTeam(team: TeamId): void {
    this.selectedTeam = team;
    this.redButton?.setAlpha(team === TEAM.RED ? 1 : 0.55);
    this.blueButton?.setAlpha(team === TEAM.BLUE ? 1 : 0.55);
  }

  private async joinGame(): Promise<void> {
    const nickInput = document.getElementById('nick') as HTMLInputElement | null;
    const nick = nickInput?.value.trim() || 'Player';

    this.statusText?.setText('Подключение к серверу...');
    this.playButton?.disableInteractive().setAlpha(0.6);

    try {
      const client = new Client(this.getWsEndpoint());
      const room = await client.joinOrCreate('game_room', {
        nick,
        team: this.selectedTeam
      });

      this.scene.start('GameScene', {
        room,
        nick,
        team: this.selectedTeam
      } as GameSceneData);
    } catch (error) {
      console.error('Join failed:', error);
      this.statusText?.setText('Сервер недоступен. Запускаю локально.');
      this.playButton?.setInteractive({ useHandCursor: true }).setAlpha(1);

      this.time.delayedCall(450, () => {
        this.scene.start('GameScene', {
          nick,
          team: this.selectedTeam
        } as GameSceneData);
      });
    }
  }

  private getWsEndpoint(): string {
    const host = window.location.hostname || 'localhost';
    return `ws://${host}:3000`;
  }
}
