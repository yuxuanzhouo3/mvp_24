# 鸿蒙应用下载按钮屏蔽解决方案

## 问题描述
- **Android 应用**：下载按钮被正确识别和屏蔽 ✅
- **鸿蒙应用**：下载按钮无法识别和屏蔽 ❌

## 根本原因
在原有的 `lib/platform-detection.ts` 文件中，只实现了以下平台的检测：
- 桌面端套壳（Electron, Tauri 等）
- iOS 套壳
- Android 套壳

**缺少鸿蒙系统（HarmonyOS）的检测**。

## 解决方案

### 1. 更新 PlatformType
在 [lib/platform-detection.ts:6](lib/platform-detection.ts#L6) 添加了 `harmonyos-app` 类型：

```typescript
export type PlatformType = 'web' | 'ios-app' | 'android-app' | 'harmonyos-app' | 'desktop-app' | 'unknown';
```

### 2. 新增 checkHarmonyOSApp() 函数
在 [lib/platform-detection.ts:119-150](lib/platform-detection.ts#L119-L150) 添加了鸿蒙检测函数：

```typescript
function checkHarmonyOSApp(ua: string): boolean {
  // 1. 直接检测 HarmonyOS 关键字
  if (/harmonyos|ohos/i.test(ua)) {
    return true;
  }

  // 2. 检测华为/荣耀设备 + WebView 特征
  const isHuaweiOrHonor = /huawei|honor/i.test(ua);
  if (isHuaweiOrHonor) {
    const hasChrome = /chrome\/[\d.]+/i.test(ua);
    if (!hasChrome && /android/i.test(ua)) {
      return true;
    }
  }

  // 3. 检测鸿蒙特定的注入对象
  if ((window as any).HarmonyOS || (window as any).OHOSInterface) {
    return true;
  }

  return false;
}
```

### 3. 在 detectPlatform() 中调用
在 [lib/platform-detection.ts:56-65](lib/platform-detection.ts#L56-L65) 添加了鸿蒙检测逻辑：

**重要**：鸿蒙的检测**必须在 Android 检测之前**，因为鸿蒙的 UA 通常包含 "Android" 字符串。

```typescript
// 3. 检测鸿蒙套壳（需要在 Android 检测之前，因为鸿蒙的 UA 通常包含 Android）
if (checkHarmonyOSApp(ua)) {
  return {
    type: 'harmonyos-app',
    isApp: true,
    isWeb: false,
    isMobile: true,
    isDesktop: false,
  };
}
```

## 检测原理

### 鸿蒙系统 User Agent 特征

1. **HarmonyOS 标识**
   - 包含 `HarmonyOS` 或 `OHOS` 关键字
   - 示例：`Mozilla/5.0 (Linux; Android 12; HarmonyOS 3.0) ...`

2. **华为/荣耀设备**
   - UA 中包含 "Huawei" 或 "Honor"
   - WebView 环境中没有完整的 Chrome 版本标识（`chrome/版本号`）
   - 示例：`Mozilla/5.0 (Linux; Android 11; Huawei Mate 50) ...`

3. **自定义对象注入**
   - 某些鸿蒙应用会注入 `window.HarmonyOS` 或 `window.OHOSInterface`

## 测试覆盖

测试了以下 User Agent 场景：

| UA 类型 | 示例 | 结果 |
|--------|------|------|
| 标准鸿蒙 | `HarmonyOS 3.0` | ✅ 识别 |
| 开源鸿蒙 | `OHOS 3.0` | ✅ 识别 |
| 华为 + HarmonyOS | `Huawei Mate 50 Pro ... HarmonyOS/3.0` | ✅ 识别 |
| 荣耀 WebView | `Honor 50 Pro ... (无 Chrome 版本)` | ✅ 识别 |
| 标准 Android | `Chrome/100.0...` | ❌ 不识别 |
| 标准 Chrome | Windows UA | ❌ 不识别 |

## 工作流程

当用户在鸿蒙应用中打开网页时：

1. **平台检测**
   - `detectPlatform()` 返回 `type: 'harmonyos-app'` 和 `isApp: true`

2. **下载按钮隐藏**
   - [Header 组件](components/header.tsx#L248-L257) 中的条件判断：
   ```typescript
   {!inApp && (
     <Button ...>下载按钮</Button>
   )}
   ```
   - 由于 `inApp` 为 `true`，下载按钮被隐藏

## 兼容性

- ✅ 不影响现有的 Android 检测
- ✅ 不影响现有的 iOS 检测
- ✅ 不影响现有的桌面端检测
- ✅ 鸿蒙设备被识别为应用而非普通网页

## 部署

代码已合并到主分支，无需额外配置。下次构建和部署时自动生效。

```bash
npm run build
# 构建成功，可以部署
```
