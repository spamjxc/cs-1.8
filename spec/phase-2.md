# 🎯 ВЕХА 2: Вертикальное движение, тактика и первая сетевая интеграция (Задачи 6–10)
*Цель вехи:* Дать игроку полную свободу перемещения (прыжки, присед, двойной прыжок), реализовать визуальное прицеливание и локальную стрельбу, затем подключить лобби и установить первое WebSocket-соединение с сервером. Сервер пока выступает только как релейщик состояния и хранитель сессий. Визуал остаётся приоритетом: каждый шаг даёт мгновенный тактильный/визуальный отклик.

---

### 🦘 Задача 6: Гравитация, прыжок и двойной прыжок
**🎯 Цель:** Реализовать вертикальную физику, поддержку двойного прыжка в воздухе и корректный сброс счётчика при касании земли.

**🛠 Техническая реализация:**
- В `GameScene.create()`:
  ```ts
  this.keys.JUMP = this.input.keyboard.addKeys('W,SPACE');
  this.jumpsLeft = 2;
  ```
- В `GameScene.update()`:
  ```ts
  const jumpPressed = Phaser.Input.Keyboard.JustDown(this.keys.JUMP);
  const isGrounded = this.player.body.touching.down;

  if (jumpPressed && this.jumpsLeft > 0) {
    this.player.setVelocityY(PHYSICS.JUMP_FORCE);
    this.jumpsLeft--;
  }

  if (isGrounded) this.jumpsLeft = 2;
  ```
- Физика гравитации уже задана в `vite.config`/Phaser config (`y: PHYSICS.GRAVITY`).

**🏗 Архитектурный контекст:**  
Клиент полностью авторитетён для прыжков. Сервер позже будет только проверять частоту (`jumpsLeft` валидация в тик-лупе) и ретранслировать позицию. `touching.down` в Arcade Physics надёжно определяет землю без raycasting.

**✅ Результат / Как тестировать:**
- Одинарный прыжок с земли → высота соответствует `-450 velocity`.
- Повторный прыжок в воздухе → второй прыжок срабатывает, третий блокируется.
- Приземление → `jumpsLeft` сбрасывается в 2.
- Нет «плавания» или зависания на платформах. FPS ≥60.

---

### 🕳 Задача 7: Механика приседа
**🎯 Цель:** Реализовать удержание `Ctrl` для уменьшения хитбокса на 50%, снижения скорости и смены визуала. Блокировка подбора оружия до следующих задач.

**🛠 Техническая реализация:**
- В `GameScene.create()`:
  ```ts
  this.keys.CROUCH = this.input.keyboard.addKey('CTRL');
  this.player.setData('crouching', false);
  ```
- В `GameScene.update()`:
  ```ts
  const isCrouching = this.keys.CROUCH.isDown;
  if (isCrouching !== this.player.getData('crouching')) {
    this.player.setData('crouching', isCrouching);
    if (isCrouching) {
      this.player.body.setSize(16, 24); // 50% от 32x48
      this.player.setScaleY(0.7);
      this.moveSpeed = PHYSICS.MOVE_SPEED / 2;
      this.player.setTexture('player_crouch');
    } else {
      this.player.body.setSize(32, 48);
      this.player.setScaleY(1);
      this.moveSpeed = PHYSICS.MOVE_SPEED;
      this.player.setTexture('player_idle');
    }
  }
  ```
- Применять `moveSpeed` в логике движения из Задачи 5.

**🏗 Архитектурный контекст:**  
Изменение `body.setSize` динамически меняет коллайдер Arcade Physics. Визуальное сжатие (`setScaleY`) синхронизировано с физикой. Это критичный prerequisite для подбора оружия (будет в задаче 18).

**✅ Результат / Как тестировать:**
- Удержание `Ctrl` → спрайт сжимается, хитбокс уменьшается вдвое, скорость падает.
- Отпускание → мгновенный возврат к исходным параметрам.
- Присед возможен в воздухе и на земле, не сбивает гравитацию.
- Визуально: замена на `player_crouch.png` (или применение scale).

---

### 🎯 Задача 8: Прицеливание мышью и поворот оружия
**🎯 Цель:** Привязать направление взгляда и оружия к курсору мыши. Обеспечить плавное вращение без дёргания и артефактов физики.

**🛠 Техническая реализация:**
- В `GameScene.create()` создать отдельный спрайт оружия и каждый кадр позиционировать его рядом с игроком:
  ```ts
  this.weapon = this.add.sprite(this.player.x, this.player.y - 15, 'weapon_pistol');
  ```
- В `GameScene.update()`:
  ```ts
  const pointer = this.input.activePointer;
  this.weapon.setPosition(this.player.x, this.player.y - 15);
  const angle = Phaser.Math.Angle.Between(
    this.player.x, this.player.y,
    pointer.worldX, pointer.worldY
  );
  this.weapon.rotation = angle;
  // Зеркалирование оружия при взгляде влево
  this.weapon.setScaleX(pointer.x < this.player.x ? -1 : 1);
  ```
- Хитбокс игрока остаётся вертикальным (Arcade Physics не любит вращение тел), вращается только визуальное оружие. Если позже нужен полноценный составной персонаж, использовать `Container`, но не вызывать `this.player.add(...)` у physics sprite: у него такого API нет.

**🏗 Архитектурный контекст:**  
Phaser Arcade оптимизирован под AABB-коллизии. Вращение хитбокса вызовет нестабильность. Поэтому физическое тело игрока остаётся вертикальным, а оружие/рука вращаются как дочерний визуальный объект. Это стандартная практика для 2D-платформеров.

**✅ Результат / Как тестировать:**
- Курсор мыши перемещается → оружие плавно следует за ним.
- Вращение не влияет на движение/прыжки/коллизии.
- При взгляде влево оружие зеркалится (`scaleX: -1`).
- Работает одновременно с бегом, прыжком и приседом.

---

### 🔫 Задача 9: Локальная стрельба (клик) и пул снарядов
**🎯 Цель:** Реализовать выстрел по ЛКМ без автоматической очереди, спавн прямых снарядов для пистолета/автомата/ракеты, дуговой бросок гранаты с удержанием силы и object-pooling для стабильного FPS.

**🛠 Техническая реализация:**
- В `GameScene.create()`:
  ```ts
  this.projectiles = this.physics.add.group({
    maxSize: 50,
    classType: Phaser.Physics.Arcade.Sprite,
    runChildUpdate: true
  });
  this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (pointer.right) return; // только ЛКМ
    this.shoot(pointer);
  });
  ```
- Метод `shoot(pointer)`:
  ```ts
  const proj = this.projectiles.get() as Phaser.Physics.Arcade.Sprite;
  if (!proj) return;
  proj.setActive(true).setVisible(true);
  proj.setPosition(this.player.x, this.player.y - 10);
  proj.setTexture('proj_bullet');
  proj.setScaleX(1.2);
  const angle = Phaser.Math.Angle.Between(proj.x, proj.y, pointer.worldX, pointer.worldY);
  proj.setVelocity(Math.cos(angle) * 800, Math.sin(angle) * 800);
  proj.setAngle(Phaser.Math.RadToDeg(angle));
  // Таймер авто-удаления
  this.time.delayedCall(2000, () => {
    if (proj.active) proj.setActive(false).setVisible(false);
  });
  ```
- В `projectiles.update()`: проверка границ экрана → `setActive(false)`.
- Для гранаты:
  - `pointerdown` начинает набор силы броска;
  - клиент рисует шкалу без ассета через `Phaser.GameObjects.Graphics`;
  - шкала растёт от `MIN_THROW_FORCE` до `MAX_THROW_FORCE` за `CHARGE_TIME_MS`;
  - `pointerup` бросает `grenade.png` по дуге: горизонтальная/вертикальная скорость рассчитываются из направления курсора и текущей силы, для тела гранаты включена гравитация;
  - пуля/автомат/ракета остаются прямолинейными снарядами.

**🏗 Архитектурный контекст:**  
`Phaser.Group` с `maxSize` предотвращает GC-фризы. Снаряды не создаются/не уничтожаются динамически, а переиспользуются. Это прямое требование из `tech-2022.md` (раздел 7). Серверная валидация частоты кликов будет добавлена позже.

**✅ Результат / Как тестировать:**
- ЛКМ → спавн снаряда, полёт по прямой со скоростью ~800 px/s.
- Граната при удержании ЛКМ показывает шкалу силы, а при отпускании летит по дуге.
- Зажатие ЛКМ не вызывает автоматическую очередь.
- Снаряды исчезают за границами или через 2 сек.
- При интенсивной стрельбе FPS держится ≥60, нет просадок памяти.

---

### 🌐 Задача 10: Лобби, ввод ника/команды и подключение к Colyseus
**🎯 Цель:** Создать экран лобби, реализовать ввод ника, выбор команды и установление WebSocket-соединения с Colyseus 0.14. Переход в игровую сцену после успешного join.

**🛠 Техническая реализация:**
- `client/src/scenes/LobbyScene.ts`:
  ```ts
  import { Client } from 'colyseus.js';
  export default class LobbyScene extends Phaser.Scene {
    constructor() { super('LobbyScene'); }
    create() {
      this.add.text(400, 200, 'CS 1.8 "Радиация"', { fontSize: '32px' }).setOrigin(0.5);
      this.nickInput = this.add.dom(640, 350).createFromHTML('<input id="nick" placeholder="Ник" maxlength="12">');
      // Кнопки команд (Red/Blue) и "Играть"
      // Обработчик onClick:
      const nick = (document.getElementById('nick') as HTMLInputElement).value || 'Player';
      const client = new Client('ws://localhost:3000');
      client.joinOrCreate('game_room', { nick, team: 'red' }).then(room => {
        this.scene.start('GameScene', { room, nick, team: 'red' });
      }).catch(err => console.error('Join failed:', err));
    }
  }
  ```
- `server/rooms/GameRoom.ts` (заглушка):
  ```ts
  import { Room, Client } from 'colyseus';
  export class GameRoom extends Room {
    onCreate() { console.log('Room created'); }
    onJoin(client: Client, options: { nick: string }) {
      console.log(`Player joined: ${options.nick}`);
    }
    onLeave() {}
  }
  ```
- `server/index.ts`: регистрация транспорта `@colyseus/ws-transport` и привязка комнаты.

**🏗 Архитектурный контекст:**  
Лобби отделено от геймплея. Colyseus берёт на себя управление сессиями и room-руутинг. Пока сервер только логирует вход, но архитектура готова к delta-sync в следующих задачах. `colyseus.js` совместим с Node 12 и Phaser 3.60.

**✅ Результат / Как тестировать:**
- При запуске открывается экран лобби с полем ввода ника.
- Нажатие «Играть» → устанавливается WS-соединение на `ws://localhost:3000`.
- В консоли сервера появляется `Player joined: [nick]`.
- Клиент автоматически переключается на `GameScene` с сохранением контекста комнаты.
- Ошибки подключения логируются, игра не крашится.

---

### 📊 Итог вехи 2
| Метрика | Значение |
|--------|----------|
| **Видимый результат** | Полностью управляемый персонаж (бег/прыжки/присед/прицел/стрельба) + рабочее лобби и WS-подключение |
| **Серверная нагрузка** | <5% (только обработка `onJoin`/`onLeave`, без тик-лупа) |
| **Готовность к тестированию** | QA проверяет физику прыжков, хитбокс приседа, отклик стрельбы, стабильность пула, успешный вход в комнату |
| **Следующий шаг** | Веха 3 (Задачи 11–15): Delta-синхронизация позиций, интерполяция, призрачный режим, команды и первая обработка попаданий |

Все задачи строго последовательны, используют уже зафиксированные константы из `shared/`, и дают немедленный визуальный/сетевой фидбек.
