export type TelegramUserIdentity = {
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  displayName: string;
};

export type TrustedAuthSession = {
  token: string;
  user: TelegramUserIdentity;
  issuedAt: number;
  expiresAt: number;
};
