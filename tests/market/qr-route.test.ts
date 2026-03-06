import { GET } from "../../app/api/tools/qr/route";

describe("/api/tools/qr", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns 400 when data is missing", async () => {
    const request = new Request("http://localhost/api/tools/qr");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
  });

  it("returns image bytes when provider succeeds", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => (name === "content-type" ? "image/png" : null),
      },
      arrayBuffer: async () => new TextEncoder().encode("png").buffer,
    } as any);

    const request = new Request(
      "http://localhost/api/tools/qr?size=280&ecc=M&data=https%3A%2F%2Fexample.com"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/");
    expect(global.fetch).toHaveBeenCalled();
  });
});
