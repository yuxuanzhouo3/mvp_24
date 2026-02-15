export type SSEJSONObject = Record<string, unknown>;

interface Boundary {
  index: number;
  length: number;
}

function findEventBoundary(buffer: string): Boundary | null {
  for (let i = 0; i < buffer.length - 1; i += 1) {
    if (buffer[i] === "\n" && buffer[i + 1] === "\n") {
      return { index: i, length: 2 };
    }

    if (
      i < buffer.length - 3 &&
      buffer[i] === "\r" &&
      buffer[i + 1] === "\n" &&
      buffer[i + 2] === "\r" &&
      buffer[i + 3] === "\n"
    ) {
      return { index: i, length: 4 };
    }
  }

  return null;
}

function parseEventData(block: string): string | null {
  const lines = block.split(/\r?\n/);
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    if (!rawLine || rawLine.startsWith(":")) {
      continue;
    }

    if (!rawLine.startsWith("data:")) {
      continue;
    }

    const value = rawLine.slice(5);
    dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
  }

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join("\n");
}

export class SSEJSONParser<T extends SSEJSONObject = SSEJSONObject> {
  private buffer = "";

  push(chunk: string): T[] {
    if (chunk) {
      this.buffer += chunk;
    }

    return this.drain(false);
  }

  flush(): T[] {
    return this.drain(true);
  }

  private drain(includeRemainder: boolean): T[] {
    const events: T[] = [];

    while (true) {
      const boundary = findEventBoundary(this.buffer);
      if (!boundary) {
        break;
      }

      const block = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary.length);

      const parsed = this.parseBlock(block);
      if (parsed) {
        events.push(parsed);
      }
    }

    if (includeRemainder) {
      const trailing = this.buffer.trim();
      this.buffer = "";

      if (trailing) {
        const parsed = this.parseBlock(trailing);
        if (parsed) {
          events.push(parsed);
        }
      }
    }

    return events;
  }

  private parseBlock(block: string): T | null {
    const payload = parseEventData(block);
    if (!payload || payload === "[DONE]") {
      return null;
    }

    try {
      return JSON.parse(payload) as T;
    } catch {
      return null;
    }
  }
}
