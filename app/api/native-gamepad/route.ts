const NATIVE_GAMEPAD_BRIDGE_URL = "http://127.0.0.1:3001/state";
const NATIVE_GAMEPAD_BRIDGE_TIMEOUT_MS = 250;

const EMPTY_NATIVE_GAMEPAD_STATE = {
  bridgeAvailable: false,
  buttons: 0,
  connected: false,
  index: 0,
  leftTrigger: 0,
  leftX: 0,
  leftY: 0,
  packet: 0,
  rightTrigger: 0,
  rightX: 0,
  rightY: 0,
  source: "xinput",
} as const;

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export const dynamic = "force-dynamic";

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    NATIVE_GAMEPAD_BRIDGE_TIMEOUT_MS,
  );

  try {
    const response = await fetch(NATIVE_GAMEPAD_BRIDGE_URL, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return Response.json(EMPTY_NATIVE_GAMEPAD_STATE, {
        headers: RESPONSE_HEADERS,
      });
    }

    const state = (await response.json()) as Record<string, unknown>;
    return Response.json(
      {
        ...EMPTY_NATIVE_GAMEPAD_STATE,
        ...state,
        bridgeAvailable: true,
      },
      { headers: RESPONSE_HEADERS },
    );
  } catch {
    return Response.json(EMPTY_NATIVE_GAMEPAD_STATE, {
      headers: RESPONSE_HEADERS,
    });
  } finally {
    clearTimeout(timeout);
  }
}
