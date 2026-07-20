const ALLOWED_CAMERA_HOST = "192.168.2.1";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const rawCameraUrl = requestUrl.searchParams.get("url") || "http://192.168.2.1/";

  let cameraUrl: URL;
  try {
    cameraUrl = new URL(rawCameraUrl);
  } catch {
    return Response.json({ error: "Invalid camera URL" }, { status: 400 });
  }

  if (cameraUrl.protocol !== "http:" || cameraUrl.hostname !== ALLOWED_CAMERA_HOST) {
    return Response.json(
      { error: `Camera proxy only allows http://${ALLOWED_CAMERA_HOST}/` },
      { status: 403 },
    );
  }

  try {
    const cameraResponse = await fetch(cameraUrl, {
      headers: { Accept: "multipart/x-mixed-replace,image/jpeg,image/*" },
      cache: "no-store",
    });
    if (!cameraResponse.ok || !cameraResponse.body) {
      return Response.json(
        { error: `Camera returned ${cameraResponse.status}` },
        { status: 502 },
      );
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      cameraResponse.headers.get("Content-Type") || "multipart/x-mixed-replace",
    );
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(cameraResponse.body, { status: 200, headers });
  } catch {
    return Response.json(
      { error: "Camera is unreachable. Join the Hopper Wi-Fi and try again." },
      { status: 502 },
    );
  }
}
