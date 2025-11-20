# P2 快速参考指南

## 🚀 快速开始

### 1. P2 自动启动

P2 的所有功能在应用启动时自动初始化，无需手动配置：

```typescript
// 在 UserContext 中已自动调用
useEffect(() => {
  initializeTokenPreloader(); // ✅ 自动启动
}, []);
```

### 2. 核心功能

| 功能               | 自动工作 | 需要调用 |
| ------------------ | -------- | -------- |
| Refresh Token 轮转 | ✅       | -        |
| Token 预加载       | ✅       | -        |
| 请求队列           | ✅       | -        |
| 详细日志           | ✅       | -        |

---

## 📊 性能数据

### Token 生命周期

```
登录 → T=0 秒
  accessToken 过期: 1 小时后
  refreshToken 过期: 7 天后

[后台每30秒检查一次]

T=55分钟
  剩余: 5 分钟
  触发: 自动预加载刷新

[刷新完成，重新计时]

T=新的55分钟
  剩余: 5 分钟
  触发: 自动预加载刷新

[循环，用户全程无感知]
```

### 刷新耗时

```
预加载检查: <1ms (本地计算)
API 刷新: 200-300ms (网络调用)
状态更新: <1ms (localStorage)
总耗时: ~200-300ms (不阻塞用户操作)
```

---

## 🔍 监控和调试

### 启用详细日志

```javascript
// 在浏览器控制台
import { authTokenPreloader } from "@/lib/auth-token-preloader";
authTokenPreloader.enableDetailedLogs();
```

### 查看日志输出

```
[AuthTokenPreloader] 2025-11-08T10:30:00.000Z ✅ Token 预加载器已初始化
   {threshold: 300, interval: 30000}

[AuthTokenPreloader] 2025-11-08T10:30:30.000Z 🔍 检查 token 过期时间
   {remainingSeconds: 120, threshold: 300}

[AuthTokenPreloader] 2025-11-08T10:30:30.100Z ⚠️  Token 即将过期，触发预加载刷新
   {remainingSeconds: 120}

[AuthTokenPreloader] 2025-11-08T10:30:30.105Z 🔄 开始刷新 token...
   {refreshTokenLength: 1200}

[AuthTokenPreloader] 2025-11-08T10:30:30.315Z ✅ Token 刷新成功（预加载）
   {elapsed: 210, newTokenLength: 1230, nextExpiresIn: 3600}
```

### 查看 Token 信息

```javascript
// 在浏览器控制台
const state = JSON.parse(localStorage.getItem("app-auth-state"));
console.log("Token Info:", {
  accessToken: state.accessToken.substring(0, 50) + "...",
  refreshToken: state.refreshToken.substring(0, 50) + "...",
  expiresAt: new Date(
    state.savedAt + state.tokenMeta.accessTokenExpiresIn * 1000
  ),
  remainingSeconds:
    (state.savedAt + state.tokenMeta.accessTokenExpiresIn * 1000 - Date.now()) /
    1000,
});
```

---

## ⚙️ 高级配置

### 修改预加载阈值

```typescript
import { authTokenPreloader } from "@/lib/auth-token-preloader";

// 改为 10 分钟阈值
authTokenPreloader.updateConfig({
  preloadThreshold: 600, // 秒
});
```

### 修改检查间隔

```typescript
// 改为 60 秒检查一次
authTokenPreloader.updateConfig({
  checkInterval: 60000, // 毫秒
});
```

### 禁用预加载

```typescript
// 停止所有预加载检查
authTokenPreloader.stop();
```

---

## 🐛 常见问题

### Q1: 为什么看不到预加载日志？

**A**: 检查以下两点：

1. 是否在开发模式

```typescript
// 日志仅在 NODE_ENV === 'development' 时启用
process.env.NODE_ENV; // 应该是 'development'
```

2. 手动启用日志

```javascript
authTokenPreloader.enableDetailedLogs();
```

### Q2: Token 轮转会影响其他设备登录吗？

**A**: 不会。每个设备的 refresh token 是独立的：

```
设备 A: refreshToken_A (有效期 7 天)
设备 B: refreshToken_B (有效期 7 天)
设备 C: refreshToken_C (有效期 7 天)

设备 A 刷新 → refreshToken_A 失效，生成 refreshToken_A' ✓
设备 B 继续使用 refreshToken_B （不受影响）✓
设备 C 继续使用 refreshToken_C （不受影响）✓
```

### Q3: 并发请求时会发起多个刷新吗？

**A**: 不会。请求队列会自动去重：

```
请求1: 发起刷新 API
请求2: 等待请求1的结果
请求3: 等待请求1的结果

[只有 1 次 API 调用]
[所有 3 个请求都收到相同的新 token]
```

### Q4: 如何强制刷新 Token？

**A**: 使用内部方法：

```typescript
import { authTokenPreloader } from "@/lib/auth-token-preloader";

// 立即刷新（不等待预加载条件）
const newToken = await authTokenPreloader.refreshTokenWithQueue();
if (newToken) {
  console.log("✅ Token 已刷新");
} else {
  console.log("❌ Token 刷新失败");
}
```

### Q5: 预加载失败会发生什么？

**A**: 系统有多层保障：

```
预加载刷新失败 (网络错误)
  ↓
用户继续正常使用
  ↓
token 完全过期时 (1小时后)
  ↓
API 请求返回 401
  ↓
getValidAccessToken() 触发刷新
  ↓
如果仍失败 → 用户重新登录
```

---

## 📈 监控指标

### 需要监控的关键指标

```typescript
// 1. 预加载成功率
// 应该接近 100%（仅网络失败时才失败）

// 2. 刷新耗时
// 应该在 200-300ms 以内
// 如果超过 1 秒，检查网络或服务器性能

// 3. 并发去重率
// 应该接近 100%（很少有多个并发刷新）

// 4. 日志体积
// 生产环境禁用日志可节省 ~10KB 每天
```

### 启用监控

```typescript
// 收集统计数据
class AuthMonitor {
  preloadCount = 0;
  refreshCount = 0;
  refreshErrors = 0;

  onPreload() {
    this.preloadCount++;
  }
  onRefresh() {
    this.refreshCount++;
  }
  onError() {
    this.refreshErrors++;
  }

  getStats() {
    return {
      preloadCount: this.preloadCount,
      refreshCount: this.refreshCount,
      errorRate: this.refreshErrors / this.refreshCount,
    };
  }
}
```

---

## 🔐 安全考虑

### Token 轮转的安全性

```
旧的 refresh token: eyJhbGc... (现已失效 ❌)
新的 refresh token: eyJhbGc... (现在有效 ✅)

假设旧 token 被盗:
  - 攻击者使用旧 token 刷新
  - 服务器返回 401 Unauthorized
  - 系统清除 auth state
  - 用户需要重新登录
```

### 建议

1. **定期监控**: 检查是否有异常的刷新请求
2. **日志告警**: 401 错误增多时发出告警
3. **地理位置**: 记录每次刷新的 IP/位置，检测异常
4. **设备指纹**: 验证同一设备的一致性

---

## 📋 检查清单

### 部署前检查

- [ ] 构建成功 (`npm run build`)
- [ ] 没有 TypeScript 错误
- [ ] `/api/auth/refresh` 端点正常
- [ ] 开发环境测试通过
- [ ] 详细日志工作正常
- [ ] 预加载自动启动
- [ ] 并发去重生效

### 部署后检查

- [ ] 用户能正常登录
- [ ] Token 在 1 小时后仍有效（预加载工作）
- [ ] 长时间使用无须重新登录
- [ ] 多标签页同步正常
- [ ] 移动设备上工作正常

---

## 🚀 生产部署

### 禁用详细日志（生产环境推荐）

```typescript
// 在应用启动时
initializeTokenPreloader({
  enableDetailedLogs: false, // 生产环境
});
```

### 启用性能监控

```typescript
// 添加性能追踪
export async function performRefresh() {
  const startTime = performance.now();

  // 执行刷新...

  const elapsed = performance.now() - startTime;
  // 发送到监控系统
  analytics.track("token_refresh", { duration: elapsed });
}
```

### 设置告警

```typescript
// 如果刷新耗时超过 500ms 就告警
if (elapsed > 500) {
  alerting.warn("Slow token refresh", { elapsed });
}

// 如果刷新失败就告警
if (!success) {
  alerting.error("Token refresh failed");
}
```

---

## 📚 相关文档

- [P0 原子性认证状态管理](./P0_IMPLEMENTATION_COMPLETE.md)
- [P1 Token 自动刷新](./P1_IMPLEMENTATION_COMPLETE.md)
- [P2 性能优化](./P2_IMPLEMENTATION_COMPLETE.md)
- [Auth State Manager API](./lib/auth-state-manager.ts)
- [Token Preloader API](./lib/auth-token-preloader.ts)

---

## 💡 提示

- 📊 使用详细日志来理解 token 生命周期
- 🔍 定期检查浏览器控制台了解系统状态
- ⚙️ 根据实际场景调整预加载阈值和检查间隔
- 🚀 在大规模部署前做充分的性能测试

---

**P2 快速参考完成 ✅**
