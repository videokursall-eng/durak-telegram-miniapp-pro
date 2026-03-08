import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramUserIdentity } from "./types.js";

/**
 * Validates Telegram Mini App initData and returns the authenticated user identity.
 * This is the only server-side source of truth for Telegram user identity.
 * initDataUnsafe (or any user data sent separately by the client) must never be trusted;
 * identity is taken solely from the signed initData after signature and TTL verification.
 */
const DEFAULT_INIT_DATA_TTL_SECONDS = 3600;

type VerifyTelegramInitDataOptions = {
  botToken: string;
  nowMs?: number;
  ttlSeconds?: number;
};

type TelegramInitDataUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
};

function buildDisplayName(user: TelegramInitDataUser) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || user.username || `tg_${user.id}`;
}

function parseTelegramUser(raw: string): TelegramUserIdentity {
  let user: TelegramInitDataUser;

  try {
    user = JSON.parse(raw) as TelegramInitDataUser;
  } catch {
    throw new Error("Telegram user payload is malformed");
  }

  if (!user.id) {
    throw new Error("Telegram user is missing");
  }

  return {
    telegramUserId: String(user.id),
    username: user.username ?? null,
    firstName: user.first_name ?? null,
    lastName: user.last_name ?? null,
    photoUrl: user.photo_url ?? null,
    displayName: buildDisplayName(user),
  };
}

function getSecretKey(botToken: string) {
  return createHmac("sha256", "WebAppData").update(botToken).digest();
}

function buildDataCheckString(params: URLSearchParams) {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function secureCompareHex(expectedHex: string, actualHex: string) {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

export function verifyTelegramInitData(
  initData: string,
  options: VerifyTelegramInitDataOptions
): TelegramUserIdentity {
  if (!initData.trim()) {
    throw new Error("Telegram initData is empty");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDateRaw = params.get("auth_date");
  const userRaw = params.get("user");

  if (!hash || !authDateRaw || !userRaw) {
    throw new Error("Telegram initData is missing required fields");
  }

  const authDateSeconds = Number(authDateRaw);
  if (!Number.isFinite(authDateSeconds)) {
    throw new Error("Telegram auth_date is invalid");
  }

  const nowMs = options.nowMs ?? Date.now();
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_INIT_DATA_TTL_SECONDS;
  if (nowMs - authDateSeconds * 1000 > ttlSeconds * 1000) {
    throw new Error("Telegram initData is expired");
  }

  const dataCheckString = buildDataCheckString(params);
  const secretKey = getSecretKey(options.botToken);
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!secureCompareHex(expectedHash, hash)) {
    throw new Error("Telegram initData signature is invalid");
  }

  return parseTelegramUser(userRaw);
}
