import { SSEJSONParser } from "../../lib/chat/sse-json-parser";

describe("SSEJSONParser", () => {
  it("parses a JSON event split across chunks", () => {
    const parser = new SSEJSONParser<any>();

    expect(parser.push('data: {"type":"content","content":"Hel')).toEqual([]);
    expect(parser.push('lo"}\n\n')).toEqual([{ type: "content", content: "Hello" }]);
  });

  it("parses multiple events and skips invalid payloads", () => {
    const parser = new SSEJSONParser<any>();

    const events = parser.push(
      [
        'data: {"type":"start"}',
        "",
        "data: not-json",
        "",
        'data: {"type":"done","tokens":{"total":12}}',
        "",
      ].join("\n")
    );

    expect(events).toEqual([{ type: "start" }]);
    expect(parser.flush()).toEqual([{ type: "done", tokens: { total: 12 } }]);
  });

  it("supports CRLF boundaries and flushes trailing events", () => {
    const parser = new SSEJSONParser<any>();

    expect(parser.push('data: {"type":"content","content":"A"}\r\n\r\n')).toEqual([
      { type: "content", content: "A" },
    ]);

    expect(parser.push('data: {"type":"done","tokens":{"total":3}}')).toEqual([]);
    expect(parser.flush()).toEqual([{ type: "done", tokens: { total: 3 } }]);
  });
});
