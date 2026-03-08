# Frontend auth persistence – audit

## 1. Where `/auth/dev` response is stored

| Location | Storage | Key | API |
|----------|---------|-----|-----|
| **`apps/web/src/net/gameSessionStore.ts`** | **sessionStorage** | **`"durak.auth-session"`** (`AUTH_STORAGE_KEY`) | `saveSessionJson(AUTH_STORAGE_KEY, payload)` (line 728) |

**When it’s written:** Inside `ensureAuthenticated()`, in the success branch of the `fetch()` to `/auth/telegram` or `/auth/dev`. After parsing the response as `AuthSession | ErrorMessage`, if `response.ok` and the payload is not an error, the code does:

```ts
saveSessionJson(AUTH_STORAGE_KEY, payload);
this.setSnapshot({
  authToken: payload.token,
  lastError: null,
});
return payload.token;
```

So the **entire success payload** (the `/auth/dev` or `/auth/telegram` response body) is persisted under `"durak.auth-session"` in **sessionStorage** via `saveSessionJson` (which uses `window.sessionStorage.setItem(key, JSON.stringify(value))`).

---

## 2. What `/auth/dev` returns (server payload)

**Server:** `apps/server/src/app.ts`, POST `AUTH_DEV_PATH` (`/auth/dev`):

```ts
return {
  token: session.token,
  user,
};
```

Where `user` is a `TelegramUserIdentity`:

- `telegramUserId: string`
- `username: string | null`
- `firstName: string | null`
- `lastName: string | null`
- `photoUrl: string | null`
- `displayName: string`

So the response body is **`{ token: string, user: TelegramUserIdentity }`** (token + session/player payload). No `issuedAt`/`expiresAt` in the HTTP response; those stay server-side.

---

## 3. Frontend type and usage of the stored payload

**Frontend type** (`gameSessionStore.ts`):

```ts
type AuthSession = {
  token: string;
  user: {
    telegramUserId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
    displayName: string;
  };
};
```

This matches the server’s `{ token, user }` shape. The frontend:

- Treats the response as `AuthSession | ErrorMessage`.
- On success, persists the full object with `saveSessionJson(AUTH_STORAGE_KEY, payload)`.
- Uses **`payload.token`** for the WebSocket and for the in-memory snapshot: `this.setSnapshot({ authToken: payload.token, ... })` and `return payload.token`.

So the returned auth data is **token + user (session/player)**; only **`token`** is used for WebSocket auth; the full object is persisted so that both token and user are available after reload.

---

## 4. Where WebSocket bootstrap reads auth from

**Read path:**

| Step | Location | What is read |
|------|----------|----------------|
| 1. Initial snapshot | `GameSessionStore` private initializer (lines 150–171) | `persistedAuth = loadSessionJson<AuthSession>(AUTH_STORAGE_KEY)` → `snapshot.authToken = persistedAuth?.token ?? null` |
| 2. After auth | `ensureAuthenticated()` success branch (lines 728–731) | `saveSessionJson(AUTH_STORAGE_KEY, payload)` then `setSnapshot({ authToken: payload.token })` |
| 3. When connecting | `connect(optionalToken?)` (lines 184–187) | `token = optionalToken ?? this.snapshot.authToken ?? null` |
| 4. WS protocols | Same `connect()` (lines 203–205) | `client.connect(getWebSocketUrl(), token ? getWsProtocols(token) : undefined)` |

So WebSocket bootstrap expects the auth **token** in one of:

- **`this.snapshot.authToken`**, or  
- **`optionalToken`** passed into `connect(token)` (e.g. from `createRoom`/`joinRoom` after `ensureAuthenticated()`).

The token in the snapshot comes from either:

- **Persisted:** `loadSessionJson(AUTH_STORAGE_KEY)` → `persistedAuth?.token` (same key and shape as what we write after `/auth/dev`), or  
- **Just received:** `payload.token` after a successful auth request, then `setSnapshot({ authToken: payload.token })`.

So the **exact place** WebSocket bootstrap uses is **`this.snapshot.authToken`**, which is:

- Filled from the **same** persisted value we write: key **`"durak.auth-session"`**, field **`token`** of the stored object.
- Or set directly from the **same** `/auth/dev` (or `/auth/telegram`) response we persist.

---

## 5. Verification: persistence matches what WS bootstrap expects

| Requirement | Status |
|-------------|--------|
| `/auth/dev` response is stored | Yes: full response `{ token, user }` stored in **sessionStorage** under **`"durak.auth-session"`**. |
| Response shape | Yes: server returns `{ token, user }`; frontend `AuthSession` matches and uses `payload.token` and persists `payload`. |
| Token available for WS | Yes: after success we do `setSnapshot({ authToken: payload.token })`, so `snapshot.authToken` is set immediately. |
| Token available after reload | Yes: initial snapshot does `persistedAuth = loadSessionJson(AUTH_STORAGE_KEY)` and `authToken: persistedAuth?.token ?? null`, so the same stored object that we write after `/auth/dev` is the one we read from. |
| Single source of truth | Yes: one key (`"durak.auth-session"`), one shape (`AuthSession`), one write site (success path of `ensureAuthenticated`), two read sites (initial snapshot and `connect()` via `snapshot.authToken`). |

**Conclusion:** The returned auth data (token + session/player) is persisted in **sessionStorage** under **`"durak.auth-session"`**. The **token** is what WebSocket bootstrap uses; it is stored in that same object and read back from it on load, and also written into `snapshot.authToken` so that `connect()` uses the exact place the bootstrap expects (`this.snapshot.authToken` or the explicit `optionalToken` from the same response). No mismatch between persistence and WS bootstrap.
