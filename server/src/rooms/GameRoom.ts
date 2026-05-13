import { Client, Room } from '@colyseus/core';

type JoinOptions = {
  nick?: string;
  team?: 'red' | 'blue';
};

export class GameRoom extends Room {
  maxClients = 20;

  onCreate(): void {
    console.log('GameRoom created');
  }

  onJoin(client: Client, options: JoinOptions): void {
    const nick = options.nick || 'Player';
    const team = options.team || 'red';

    console.log(`Player joined: ${nick} (${team}) [${client.sessionId}]`);
  }

  onLeave(client: Client): void {
    console.log(`Player left: ${client.sessionId}`);
  }
}
