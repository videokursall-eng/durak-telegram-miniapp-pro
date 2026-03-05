# Security — Telegram initData, auth, WS

## 1) Почему это важно
Если не проверять `initData`, любой сможет подделать запрос и зайти “как другой пользователь”.

## 2) Поток авторизации (рекомендуемый)
1) Клиент (Mini App) получает `window.Telegram.WebApp.initData`.
2) Клиент отправляет `initData` на сервер: `POST /auth/telegram`.
3) Сервер:
   - валидирует подпись `initData` по правилам Telegram
   - извлекает `user` (id, username, first_name, photo_url)
   - выдаёт `authToken` (JWT/opaque)
4) Клиент открывает WS и передаёт `authToken`.
5) Сервер на WS:
   - валидирует токен
   - привязывает соединение к playerId
   - применяет rate limits

## 3) Что логировать
- userId, matchId, actionId, actionType
- ошибки валидации
- версию state при каждом action

## 4) Минимальные меры
- WS rate limit
- Idempotency по actionId
- Отсечение “устаревших” действий (если clientVersion << serverVersion)
