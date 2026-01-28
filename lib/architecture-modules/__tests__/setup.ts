// __tests__/setup.ts - Jest测试环境设置
import { TextEncoder, TextDecoder } from "util";

// 设置全局的TextEncoder和TextDecoder
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

// 设置全局的fetch mock
(global as any).fetch = jest.fn();

// 设置AbortController polyfill（如果需要）
if (typeof global.AbortController === "undefined") {
  (global as any).AbortController = class AbortController {
    signal = { aborted: false };
    abort() {
      this.signal.aborted = true;
    }
  };
}
