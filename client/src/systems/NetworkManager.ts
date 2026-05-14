import { Room } from 'colyseus.js';
import { NETWORK } from '@shared/constants';
import { AdminCommandEvent, ExplosionEvent, GameEventPayload, InputCommand, PickupEvent, ShootEvent } from '@shared/types/network';

type PlayerCallback = (player: any, id: string) => void;
type EventCallback = (event: GameEventPayload) => void;

export class NetworkManager {
  private nextSendAt = 0;
  private tick = 0;
  private readonly playerCallbacks: PlayerCallback[] = [];
  private readonly playerRemoveCallbacks: Array<(id: string) => void> = [];
  private readonly eventCallbacks: EventCallback[] = [];

  constructor(private readonly room: Room) {}

  start(): void {
    const players = (this.room.state as any).players;

    if (players) {
      players.forEach((player: any, id: string) => this.bindPlayer(player, id));
      players.onAdd = (player: any, id: string) => this.bindPlayer(player, id);
      players.onRemove = (_player: any, id: string) => {
        this.playerRemoveCallbacks.forEach((callback) => callback(id));
      };
    }

    this.room.onMessage('event', (event: GameEventPayload) => {
      this.eventCallbacks.forEach((callback) => callback(event));
    });
  }

  sendInput(time: number, input: Omit<InputCommand, 'tick'>): void {
    if (time < this.nextSendAt) {
      return;
    }

    this.nextSendAt = time + NETWORK.TICK_MS;
    this.tick++;
    this.room.send('input', {
      ...input,
      tick: this.tick
    } as InputCommand);
  }

  sendHit(targetId: string, projectileX: number, projectileY: number, damage: number): void {
    this.room.send('hit', {
      targetId,
      projectileX,
      projectileY,
      damage
    });
  }

  sendExplosion(payload: ExplosionEvent): void {
    this.room.send('explode', payload);
  }

  sendPickup(payload: PickupEvent): void {
    this.room.send('pickup', payload);
  }

  sendShot(payload: ShootEvent): void {
    this.room.send('shoot', payload);
  }

  sendAdminAuth(password: string): void {
    this.room.send('admin_auth', { password });
  }

  sendAdminCommand(payload: AdminCommandEvent): void {
    this.room.send('admin_cmd', payload);
  }

  onPlayer(callback: PlayerCallback): void {
    this.playerCallbacks.push(callback);
  }

  onPlayerRemove(callback: (id: string) => void): void {
    this.playerRemoveCallbacks.push(callback);
  }

  onEvent(callback: EventCallback): void {
    this.eventCallbacks.push(callback);
  }

  getSessionId(): string {
    return this.room.sessionId;
  }

  private bindPlayer(player: any, id: string): void {
    this.playerCallbacks.forEach((callback) => callback(player, id));
    player.onChange = () => {
      this.playerCallbacks.forEach((callback) => callback(player, id));
    };
  }
}
