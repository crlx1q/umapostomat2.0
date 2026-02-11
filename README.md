# 3D симуляция постомата в магазине

Мини-игра в браузере: 3D сцена магазина + постомат (чёрный корпус), управление как в FPS, серверная бизнес-логика, QR-сессии, телефон игрока и админка.

## Запуск

```bash
npm install
npm run dev
```

Откройте:
- Игра: `http://localhost:3000`
- Админка: `http://localhost:3000/admin.html`

Можно запускать сервер отдельно:

```bash
npm run server
```

## Переменные окружения

- `PORT` (по умолчанию `3000`)
- `HOST` (по умолчанию `0.0.0.0`)
- `ADMIN_PASSWORD` (по умолчанию `admin123`)

## Управление в игре

При первом входе игра просит ввести имя пользователя. Это имя используется для сессии и отображения мультиплеера (другие игроки видны в сцене).

- `W A S D` — ходьба
- Мышь — обзор (pointer lock)
- `Shift` — ускорение
- `E` — взаимодействие
- `Tab` или `M` — телефон игрока
- `F` — фокус камеры на монитор терминала / возврат
- `Esc` — закрытие UI / выход из pointer lock

## Основной флоу получения посылки

1. Подойдите к экрану постомата, нажмите `E`.
2. Нажмите **«Сканировать текущий QR»** (сервер валидирует токен).
3. Откройте телефон (`Tab/M`) — появится список посылок пользователя `player1`.
4. Нажмите **«Открыть ячейку»**.
5. Подойдите к открытой ячейке, нажмите `E` на коробке — посылка получена.

## Админка

Пароль: `ADMIN_PASSWORD` (demo: `admin123`).

Функции:
- CRUD посылок.
- Назначение пользователю (`player1`/`player2`) и ячейке (или автоподбор).
- Просмотр и ручное открытие/закрытие ячеек.
- Массовое действие: закрыть все ячейки одной кнопкой.
- Диагностика:
  - `RGB test start/stop` — экран заливается Red/Green/Blue, потом возврат к QR.
  - `Test open all sequentially` — последовательное открытие всех ячеек.
  - `Stop test` — остановка последовательного теста (открытые остаются открыты).

## API (ключевое)

- `GET /api/qr/current`
- `POST /api/qr/scan`
- `GET /api/user/:id/shipments`
- `POST /api/shipment/:id/open`
- `POST /api/shipment/:id/pickup`
- `GET /api/cells`
- `POST /api/cells/:id/open` (admin)
- `POST /api/cells/:id/close`
- `POST /api/admin/shipments`, `PUT`, `DELETE`
- `POST /api/admin/test/rgb/start|stop`
- `POST /api/admin/test/open-seq/start|stop`

Realtime: WebSocket события `qrUpdated`, `cellOpened`, `cellClosed`, `shipmentUpdated`, `testModeChanged`, `screenModeChanged`.
