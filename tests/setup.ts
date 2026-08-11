// Node 环境下没有扩展 runtime;src/utils/config.ts 在模块顶层读取
// chrome.runtime,这里提供最小 stub 让被测模块可以加载。
const chromeStub = {
  runtime: {
    getManifest: () => ({ version: "0.0.0-test" }),
    getURL: (path: string) => `chrome-extension://ophel-test/${path}`,
  },
}

if (typeof globalThis.chrome === "undefined") {
  ;(globalThis as Record<string, unknown>).chrome = chromeStub
}
