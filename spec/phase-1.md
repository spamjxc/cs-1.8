# 🎯 ВЕХА 1: Клиентский фундамент и визуальное ядро (Задачи 1–5)
*Цель вехи:* Развернуть рабочую среду, вынести общий контракт, поднять Phaser и дать игроку базовое, отзывчивое управление. Сервер пока не участвует в геймплее – всё считается на клиенте, чтобы заказчик и QA сразу видели анимации, физику и аркадный отклик.

---

### 📦 Задача 1: Инициализация репозитория и структуры проекта
**🎯 Цель:** Создать строго соответствующую спеке файловую структуру, зафиксировать версии Node/npm, подготовить `.gitignore` и базовые конфиги.

**🛠 Техническая реализация:**
- `mkdir radiation-game && cd radiation-game && git init`
- Создать дерево: `shared/src/`, `client/src/`, `client/assets/`, `client/public/`, `server/src/`, `scripts/`, `dist/`
- Корневой `package.json`:
  ```json
  {
    "engines": { "node": "12.22.12", "npm": "6.14.16" },
    "scripts": {
      "build:shared": "tsc -p shared/tsconfig.json",
      "dev:client": "vite --config client/vite.config.ts",
      "dev:server": "tsc-watch -p server/tsconfig.json --onSuccess \"node server/dist/index.js\"",
      "dev": "npm run build:shared && concurrently \"npm run dev:client\" \"npm run dev:server\"",
      "typecheck": "tsc --noEmit"
    }
  }
  ```
- Корневой `tsconfig.json`: `{ "strict": true, "target": "ES2019", "module": "CommonJS", "esModuleInterop": true, "skipLibCheck": true }`
- `.gitignore`: `node_modules/`, `dist/`, `shared/dist/`, `*.tsbuildinfo`, `.env`

**🏗 Архитектурный контекст:**  
npm 6 не поддерживает workspaces, поэтому сборка будет строго последовательной. Структура сразу готовит пути для импорта `../shared/dist/...` из клиента и сервера.

**✅ Результат / Как тестировать:**
- `npm install` проходит без ошибок, `node -v` и `npm -v` соответствуют спеке.
- В репозитории ровно та структура папок, что указана в `tech-2022.md`.
- `npm run typecheck` не выдаёт ошибок на пустых `.ts` файлах.

---

### ⚙️ Задача 2: Конфигурация Vite (клиент) и Express (сервер статики)
**🎯 Цель:** Поднять dev-среду: клиент на `:5173` с HMR, сервер на `:3000` отдаёт статику и проксирует запросы.

**🛠 Техническая реализация:**
- Runtime-зависимости: `npm i phaser@3.60.0 express@4.18.2 serve-static@1.15.0 colyseus@0.14.20 @colyseus/ws-transport@0.14.20 @colyseus/schema@1.0.40 colyseus.js@0.14 msgpack-lite@0.1.13`
- Dev-зависимости под Node 12: `npm i -D typescript@4.9.5 vite@2.9.18 concurrently@7.0.0 tsc-watch@6.2.1 @types/express@4.17.21`
- `client/vite.config.ts`:
  ```ts
  import { defineConfig } from 'vite';
  export default defineConfig({
    root: './client',
    build: { outDir: '../dist/client', emptyOutDir: true, target: 'es2019' },
    server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } }
  });
  ```
- `server/src/index.ts`:
  ```ts
  import express from 'express';
  import path from 'path';
  const app = express();
  app.use(express.static(path.join(__dirname, '../../dist/client')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../../dist/client/index.html')));
  app.listen(3000, () => console.log('Static server on :3000'));
  ```
- В `client/index.html` подключить `<script type="module" src="/src/main.ts"></script>`.

**🏗 Архитектурный контекст:**  
Сервер пока только HTTP-хост для статики. Позже сюда будет поднят Colyseus WS. Прокси в Vite нужен для будущих API-запросов без CORS.

**✅ Результат / Как тестировать:**
- `npm run dev` запускает два процесса. В браузере `http://localhost:3000` открывается пустая страница с заголовком из `index.html`.
- Изменение текста в `index.html` или `main.ts` мгновенно отражается в браузере (HMR).
- В консоли сервера нет ошибок 404 при переходе на `/`.

---

### 📐 Задача 3: Shared-модуль и фиксация ассетов/констант
**🎯 Цель:** Вынести единый источник правды для имён файлов, физических параметров и игровых лимитов.

**🛠 Техническая реализация:**
- `shared/tsconfig.json`: `{ "extends": "../tsconfig.json", "compilerOptions": { "outDir": "../shared/dist", "declaration": true } }`
- `shared/src/constants.ts`:
  ```ts
  export const ASSET_NAMES = {
    PLAYER_IDLE: 'player_base.png',
    PLAYER_RUN: 'player_run.png',
    PLAYER_CROUCH: 'player_crouch.png',
    PLAYER_DAMAGE: 'player_damage.png',
    HELMET_RED: 'helmet_red.png',
    HELMET_BLUE: 'helmet_blue.png',
    TILE_FLOOR: 'tile_ground.png',
    TILE_WALL: 'tile_wall.png',
    TILE_RAMP: 'tile_ramp.png'
  } as const;

  export const PHYSICS = { GRAVITY: 1000, MOVE_SPEED: 200, JUMP_FORCE: -450, FRICTION: 1000 };
  export const GAME = { MAX_HP: 100, ZONE_DAMAGE_RATE: 5, RESPAWN_TIME: 30 };
  ```
- Добавить `import { ... } from '../shared/dist/constants'` в `client/src/main.ts` (пока только для теста).
- Убедиться, что `npm run build:shared` генерирует `.js` и `.d.ts` в `shared/dist/`.

**🏗 Архитектурный контекст:**  
Имена файлов зафиксированы на этапе спеки. Любое отклонение сломает загрузку. Константы позже станут основой для серверной валидации и клиентской физики.

**✅ Результат / Как тестировать:**
- `npm run build:shared` завершается успешно.
- Клиент импортирует `constants.ASSET_NAMES.PLAYER_RUN` и выводит в консоль: `Loaded asset config: player_run.png`.
- Типы подсвечиваются в IDE, автодополнение работает.

---

### 🎨 Задача 4: Инициализация сцены Phaser 3.60 и загрузчик ассетов
**🎯 Цель:** Поднять игровой движок, настроить Arcade Physics, загрузить ассеты по контракту и отрендерить базовую сцену.

**🛠 Техническая реализация:**
- `npm i phaser@3.60.0`
- `client/src/main.ts`:
  ```ts
  import Phaser from 'phaser';
  import { ASSET_NAMES, PHYSICS } from '../shared/dist/constants';
  import GameScene from './scenes/GameScene';

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: 'game-container',
    physics: { default: 'arcade', arcade: { gravity: { y: PHYSICS.GRAVITY }, debug: false } },
    scene: [GameScene]
  };
  new Phaser.Game(config);
  ```
- `client/src/scenes/GameScene.ts`:
  ```ts
  import Phaser from 'phaser';
  import { ASSET_NAMES } from '../../shared/dist/constants';

  export default class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }
    preload() {
      this.load.image('floor', `assets/${ASSET_NAMES.TILE_FLOOR}`);
      this.load.spritesheet('player_run', `assets/${ASSET_NAMES.PLAYER_RUN}`, { frameWidth: 49, frameHeight: 58 });
      this.load.image('player_idle', `assets/${ASSET_NAMES.PLAYER_IDLE}`);
    }
    create() {
      this.add.image(640, 360, 'floor').setScale(20);
      this.anims.create({ key: 'run', frames: this.anims.generateFrameNumbers('player_run'), frameRate: 10, repeat: -1 });
      this.player = this.physics.add.sprite(100, 200, 'player_idle').setCollideWorldBounds(true);
    }
    update() {}
  }
  ```
- Положить заглушки `player_base.png`, `player_run.png` (можно временные пиксельные) в `client/assets/`.

**🏗 Архитектурный контекст:**  
Phaser берёт на себя рендер, цикл обновления и базовую физику. Сервер не участвует. Debug-физика пока выключена, но включится в задаче 29.

**✅ Результат / Как тестировать:**
- При `npm run dev` в браузере виден фон и спрайт стикмена.
- В консоли Phaser: `Loaded X assets`. Ошибок 404 нет.
- Спрайт стоит на полу, не проваливается (Arcade + `setCollideWorldBounds`).

---

### 🕹 Задача 5: Горизонтальное движение (A/D) и синхронизация анимаций
**🎯 Цель:** Реализовать отзывчивое управление, переключение idle/run, зеркальное отражение спрайта и базовую обработку ввода.

**🛠 Техническая реализация:**
- В `GameScene.create()`:
  ```ts
  this.cursors = this.input.keyboard.createCursorKeys();
  this.keys = this.input.keyboard.addKeys('A,D');
  ```
- В `GameScene.update()`:
  ```ts
  const moveLeft = this.keys.A.isDown || this.cursors.left.isDown;
  const moveRight = this.keys.D.isDown || this.cursors.right.isDown;
  let dir = 0;
  if (moveLeft) dir = -1;
  else if (moveRight) dir = 1;

  this.player.body.setVelocityX(dir * PHYSICS.MOVE_SPEED);
  this.player.setFlipX(dir === 1); // Разворот спрайта

  if (Math.abs(this.player.body.velocity.x) > 10) {
    this.player.anims.play('run', true);
  } else {
    this.player.anims.stop();
    this.player.setTexture('player_idle');
  }
  ```
- Добавить базовую проверку земли: `this.physics.add.collider(this.player, this.groundGroup)` (пока можно использовать `setCollideWorldBounds(true)` как заглушку).

**🏗 Архитектурный контекст:**  
Чисто клиентская логика. Скорость, ускорение и анимация полностью управляются Phaser. Это "золотой стандарт" для клиент-авторитативного шутера: отклик 0 задержки, сервер позже только релейнет позицию.

**✅ Результат / Как тестировать:**
- Нажатие `A/D` → стикмен плавно разгоняется, анимация бега (10 кадров) проигрывается циклично.
- Отпускание → мгновенный переход в `idle`, скорость гаснет.
- Смена направления → спрайт зеркалится без артефактов.
- FPS стабильно ≥60, нет "дёрганья" или залипания клавиш.
- Заказчик видит: **"Персонаж двигается, выглядит живым, управление работает как в аркаде"**.

---

### 📊 Итог вехи 1
| Метрика | Значение |
|--------|----------|
| **Видимый результат** | Играбельный клиент с движением, анимациями и стабильным FPS |
| **Серверная нагрузка** | 0% (только отдача статики) |
| **Готовность к тестированию** | QA может проверить отклик, физику, переключение спрайтов |
| **Следующий шаг** | Подключение прыжка, гравитации и приседа (Задачи 6–7) |

Все задачи строго последовательны, не требуют параллелизма и дают немедленный визуальный фидбек.
