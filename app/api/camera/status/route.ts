const HOPPER_CAMERA_URL = "http://192.168.2.1/";

export const dynamic = "force-dynamic";

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(HOPPER_CAMERA_URL, {
      headers: { Accept: "multipart/x-mixed-replace,image/jpeg,image/*" },
      cache: "no-store",
      signal: controller.signal,
    });
    await response.body?.cancel().catch(() => undefined);

    if (!response.ok) {
      return Response.json(
        { connected: false, status: response.status },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      { connected: true, host: "192.168.2.1" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { connected: false, host: "192.168.2.1" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
