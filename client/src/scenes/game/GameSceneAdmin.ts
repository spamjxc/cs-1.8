// @ts-nocheck
import * as Phaser from 'phaser';
import type { AdminCommandType, GameEventPayload } from '@shared/types/network';
import { GameSceneHud } from './GameSceneHud';

export abstract class GameSceneAdmin extends GameSceneHud {
  protected createAdminPanel(): void {
    const container = document.getElementById('game-container');
    if (!container) {
      return;
    }

    this.adminElement = document.createElement('div');
    this.adminElement.style.position = 'absolute';
    this.adminElement.style.right = '12px';
    this.adminElement.style.top = '12px';
    this.adminElement.style.transformOrigin = 'top right';
    this.adminElement.style.zIndex = '35';
    this.adminElement.style.display = 'block';
    this.adminElement.style.padding = '8px';
    this.adminElement.style.border = '2px solid rgba(128, 150, 96, 0.72)';
    this.adminElement.style.borderRadius = '3px';
    this.adminElement.style.background = 'rgba(13, 17, 14, 0.88)';
    this.adminElement.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.7), inset 0 0 18px rgba(97, 128, 67, 0.16)';
    this.adminElement.style.color = '#e8f3d0';
    this.adminElement.style.font = '700 12px Arial, sans-serif';
    this.adminElement.style.textTransform = 'uppercase';
    this.adminElement.style.letterSpacing = '0';
    this.adminElement.innerHTML = `
      <button data-action="restart">Пересоздать</button>
      <button data-action="balance">Автобаланс: выкл</button>
      <button data-action="exit">Выйти</button>
    `;
    this.adminElement.querySelectorAll('button').forEach((button) => this.styleGameButton(button as HTMLButtonElement));
    this.adminElement.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const action = target.getAttribute('data-action');
      if (action === 'restart') {
        this.requestAdminCommand('restart', target as HTMLButtonElement);
      } else if (action === 'balance') {
        this.requestAdminCommand('toggle_balance', target as HTMLButtonElement);
      } else if (action === 'exit') {
        this.exitToLobby();
      }
    });
    container.appendChild(this.adminElement);
    this.createAdminModal(container);
    this.updateAdminPanel();
    this.applyAdminResponsiveLayout();
  }

  protected styleGameButton(button: HTMLButtonElement): void {
    button.style.minWidth = '96px';
    button.style.height = '30px';
    button.style.marginRight = '6px';
    button.style.padding = '0 9px';
    button.style.border = '1px solid #6f805f';
    button.style.borderRadius = '2px';
    button.style.background = 'linear-gradient(180deg, #263025 0%, #151d16 100%)';
    button.style.color = '#dce8cc';
    button.style.font = '700 12px Arial, sans-serif';
    button.style.textTransform = 'uppercase';
    button.style.letterSpacing = '0';
    button.style.textShadow = '0 1px 1px #000';
    button.style.cursor = 'pointer';
    button.style.boxShadow = 'inset 0 1px 0 rgba(232,243,208,0.12), 0 2px 0 #070907';
  }

  protected createAdminModal(container: HTMLElement): void {
    this.adminModalElement = document.createElement('div');
    this.adminModalElement.style.position = 'absolute';
    this.adminModalElement.style.left = '0';
    this.adminModalElement.style.top = '0';
    this.adminModalElement.style.width = '100%';
    this.adminModalElement.style.height = '100%';
    this.adminModalElement.style.zIndex = '60';
    this.adminModalElement.style.display = 'none';
    this.adminModalElement.style.alignItems = 'center';
    this.adminModalElement.style.justifyContent = 'center';
    this.adminModalElement.style.background = 'rgba(5, 8, 6, 0.62)';
    this.adminModalElement.innerHTML = `
      <div data-admin-modal-panel style="width:min(360px,calc(100% - 32px));border:2px solid rgba(128,150,96,0.78);border-radius:3px;background:#111711;color:#e8f3d0;padding:16px;box-shadow:0 0 0 1px #000,inset 0 0 22px rgba(97,128,67,0.2);font:700 13px Arial,sans-serif;">
        <div style="font-size:16px;text-transform:uppercase;margin-bottom:10px;">Пароль администратора</div>
        <input data-admin-password type="password" autocomplete="off" style="width:100%;height:38px;background:#0a0f0b;color:#e8f3d0;border:1px solid #6f805f;border-radius:2px;padding:0 10px;font:700 16px Arial,sans-serif;outline:none;" />
        <div data-admin-error style="min-height:18px;margin-top:8px;color:#f1d27a;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
          <button data-action="cancel-password">Отмена</button>
          <button data-action="submit-password">OK</button>
        </div>
      </div>
    `;
    this.adminModalElement.querySelectorAll('button').forEach((button) => this.styleGameButton(button as HTMLButtonElement));
    const input = this.adminModalElement.querySelector('[data-admin-password]') as HTMLInputElement | null;
    input?.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        this.submitAdminPassword();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.closeAdminModal();
      }
    });
    input?.addEventListener('keyup', (event) => event.stopPropagation());
    input?.addEventListener('keypress', (event) => event.stopPropagation());
    this.adminModalElement.addEventListener('click', (event) => {
      if (event.target === this.adminModalElement) {
        this.closeAdminModal();
        return;
      }

      const target = event.target as HTMLElement;
      const action = target.getAttribute('data-action');
      if (action === 'cancel-password') {
        this.closeAdminModal();
      } else if (action === 'submit-password') {
        this.submitAdminPassword();
      }
    });
    this.adminModalElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.submitAdminPassword();
      } else if (event.key === 'Escape') {
        this.closeAdminModal();
      }
    });
    container.appendChild(this.adminModalElement);
    this.applyAdminResponsiveLayout();
  }

  protected handleAdminEvent(event: GameEventPayload): void {
    if (typeof event.autoBalance === 'boolean') {
      this.autoBalance = event.autoBalance;
    }

    if (this.network && event.targetId === this.network.getSessionId() && event.message === 'granted') {
      this.isAdmin = true;
      this.addChatMessage('[ADMIN] Доступ открыт');
      this.runPendingAdminCommand();
    } else if (this.network && event.targetId === this.network.getSessionId() && event.message === 'auth_failed') {
      this.setPendingAdminButton(false);
      this.setAdminModalError('Неверный пароль');
    }

    this.updateAdminPanel();
  }

  protected updateAdminPanel(): void {
    if (!this.adminElement) {
      return;
    }

    const balanceButton = this.adminElement.querySelector('[data-action="balance"]') as HTMLButtonElement | null;

    if (balanceButton) {
      balanceButton.textContent = `Автобаланс: ${this.autoBalance ? 'вкл' : 'выкл'}`;
      balanceButton.style.borderColor = this.autoBalance ? '#9bdc4a' : '#6f805f';
      balanceButton.style.color = this.autoBalance ? '#e8f3d0' : '#dce8cc';
    }

    this.applyAdminResponsiveLayout();
  }

  protected applyAdminResponsiveLayout(): void {
    const scale = this.getHudUiScale();
    const edge = this.isMobileViewport() ? 8 : 12;

    if (this.adminElement) {
      this.adminElement.style.right = `${edge}px`;
      this.adminElement.style.top = `${edge}px`;
      this.adminElement.style.transform = `scale(${scale})`;
    }

    const modalPanel = this.adminModalElement?.querySelector('[data-admin-modal-panel]') as HTMLElement | null;
    if (modalPanel) {
      modalPanel.style.transform = `scale(${scale})`;
      modalPanel.style.transformOrigin = 'center center';
    }
  }

  protected requestAdminCommand(type: AdminCommandType, button?: HTMLButtonElement): void {
    if (!this.network) {
      this.addChatMessage('[ADMIN] Сервер недоступен');
      return;
    }

    if (this.isAdmin) {
      this.network.sendAdminCommand({ type });
      return;
    }

    this.pendingAdminCommand = type;
    this.pendingAdminButton = button;
    this.openAdminModal();
  }

  protected openAdminModal(): void {
    if (!this.adminModalElement) {
      return;
    }

    const input = this.adminModalElement.querySelector('[data-admin-password]') as HTMLInputElement | null;
    const error = this.adminModalElement.querySelector('[data-admin-error]') as HTMLElement | null;

    if (input) {
      input.value = '';
    }
    if (error) {
      error.textContent = '';
    }

    this.adminModalOpen = true;
    this.releaseGameKeyCapture();
    this.adminModalElement.style.display = 'flex';
    window.setTimeout(() => input?.focus(), 0);
  }

  protected closeAdminModal(): void {
    if (this.adminModalElement) {
      this.adminModalElement.style.display = 'none';
    }
    this.adminModalOpen = false;
    this.restoreGameKeyCapture();
    this.setPendingAdminButton(false);
    this.pendingAdminCommand = undefined;
    this.pendingAdminButton = undefined;
  }

  protected submitAdminPassword(): void {
    if (!this.network || !this.adminModalElement) {
      return;
    }

    const input = this.adminModalElement.querySelector('[data-admin-password]') as HTMLInputElement | null;
    const password = input?.value.trim() || '';
    if (!password) {
      this.setAdminModalError('Введите пароль');
      return;
    }

    this.setPendingAdminButton(true);
    this.network.sendAdminAuth(password);
  }

  protected runPendingAdminCommand(): void {
    if (!this.pendingAdminCommand || !this.network) {
      return;
    }

    this.network.sendAdminCommand({ type: this.pendingAdminCommand });
    this.setPendingAdminButton(false);
    if (this.adminModalElement) {
      this.adminModalElement.style.display = 'none';
    }
    this.adminModalOpen = false;
    this.restoreGameKeyCapture();
    this.pendingAdminCommand = undefined;
    this.pendingAdminButton = undefined;
  }

  protected releaseGameKeyCapture(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    keyboard.resetKeys();
    this.getGameplayKeyCodes().forEach((keyCode) => keyboard.removeCapture(keyCode));
    keyboard.enabled = false;
  }

  protected restoreGameKeyCapture(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    keyboard.enabled = true;
    this.getGameplayKeyCodes().forEach((keyCode) => keyboard.addCapture(keyCode));
    keyboard.resetKeys();
  }

  protected getGameplayKeyCodes(): number[] {
    return [
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.CTRL,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR
    ];
  }

  protected setAdminModalError(message: string): void {
    const error = this.adminModalElement?.querySelector('[data-admin-error]') as HTMLElement | null;
    if (error) {
      error.textContent = message;
    }
  }

  protected setPendingAdminButton(disabled: boolean): void {
    if (!this.pendingAdminButton) {
      return;
    }

    this.pendingAdminButton.disabled = disabled;
    this.pendingAdminButton.style.opacity = disabled ? '0.55' : '1';
  }

  protected exitToLobby(): void {
    if (this.room) {
      void this.room.leave();
      this.room = undefined;
      this.network = undefined;
    }

    this.scene.start('LobbyScene');
  }

}
