import { test, expect } from "@playwright/test";

const APP_URL = "http://localhost:5173";

test("local create and join room flow works", async ({ browser }) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const consoleA: string[] = [];
  const webSocketsA: string[] = [];

  await pageA.addInitScript(() => {
    const OriginalWebSocket = window.WebSocket;
    const calls: Array<{ url: string; protocols: string | string[] | undefined }> = [];
    class TrackingWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        calls.push({
          url: String(url),
          protocols,
        });
        super(url, protocols);
      }
    }
    Object.defineProperty(window, "__wsCalls", {
      value: calls,
      configurable: true,
    });
    // @ts-expect-error runtime monkey patch for test instrumentation
    window.WebSocket = TrackingWebSocket;
  });

  pageA.on("console", (message) => {
    consoleA.push(`${message.type()}: ${message.text()}`);
  });
  pageA.on("websocket", (webSocket) => {
    webSocketsA.push(webSocket.url());
  });

  await pageA.goto(APP_URL, { waitUntil: "networkidle" });
  await expect(pageA.getByText("Durak Multiplayer")).toBeVisible();
  await expect(pageA.getByText("Local development auth fallback", { exact: false })).toBeVisible();

  await pageA.getByPlaceholder("Ваше имя").fill("Alice");
  await pageA.getByRole("button", { name: "Создать комнату" }).click();
  await pageA.waitForTimeout(1500);
  const authSessionA = await pageA.evaluate(() => window.sessionStorage.getItem("durak.auth-session"));
  const wsCallsA = await pageA.evaluate(() => (window as any).__wsCalls ?? []);
  console.log(JSON.stringify({ authSessionA, wsCallsA }));

  await expect(pageA.getByText("Waiting Room")).toBeVisible({ timeout: 15000 });
  const roomCodeLineA = await pageA.getByText(/Комната:\s*[A-Z0-9]+/).first().textContent();
  const roomId = roomCodeLineA?.split(":").pop()?.trim();
  if (!roomId) {
    throw new Error(`Failed to extract room id from "${roomCodeLineA}"`);
  }

  await expect(pageA.getByText("[dev] Alice", { exact: false })).toBeVisible();
  await expect(pageA.getByText("WS: connected")).toBeVisible();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const consoleB: string[] = [];
  const webSocketsB: string[] = [];

  pageB.on("console", (message) => {
    consoleB.push(`${message.type()}: ${message.text()}`);
  });
  pageB.on("websocket", (webSocket) => {
    webSocketsB.push(webSocket.url());
  });

  await pageB.goto(APP_URL, { waitUntil: "networkidle" });
  await expect(pageB.getByText("Durak Multiplayer")).toBeVisible();
  await pageB.getByPlaceholder("Ваше имя").fill("Bob");
  await pageB.getByPlaceholder("Код комнаты").fill(roomId);
  await pageB.getByRole("button", { name: "Войти в комнату" }).click();

  await expect(pageB.getByText("Waiting Room")).toBeVisible({ timeout: 15000 });
  await expect(pageB.getByText(`Комната: ${roomId}`)).toBeVisible();
  await expect(pageB.getByText("[dev] Bob", { exact: false })).toBeVisible();
  await expect(pageB.getByText("WS: connected")).toBeVisible();

  await expect(pageA.getByText("[dev] Bob", { exact: false })).toBeVisible({ timeout: 15000 });
  await expect(pageB.getByText("[dev] Alice", { exact: false })).toBeVisible({ timeout: 15000 });

  const pageAText = await pageA.locator("body").textContent();
  const pageBText = await pageB.locator("body").textContent();
  expect(pageAText).toContain(`Комната: ${roomId}`);
  expect(pageBText).toContain(`Комната: ${roomId}`);

  await pageA.getByRole("button", { name: "Старт: простой" }).click();
  await expect(pageA.getByText("Матч запускается", { exact: false })).toBeVisible({ timeout: 15000 });
  await expect(pageB.getByText("Матч запускается", { exact: false })).toBeVisible({ timeout: 15000 });

  console.log(
    JSON.stringify({
      roomId,
      createRoom: "ok",
      joinRoom: "ok",
      sharedRoomState: "ok",
      startGame: "ok",
      wsUrlsA: webSocketsA,
      wsUrlsB: webSocketsB,
      consoleErrorsA: consoleA.filter((entry) => entry.startsWith("error")),
      consoleErrorsB: consoleB.filter((entry) => entry.startsWith("error")),
    })
  );

  await contextA.close();
  await contextB.close();
});
