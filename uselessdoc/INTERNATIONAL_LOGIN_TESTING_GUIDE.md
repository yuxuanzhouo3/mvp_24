# 国际版邮箱登录 - 快速测试指南

## 修复概述

✅ **问题**: 国际版无法使用邮箱登录
✅ **原因**: Supabase 客户端初始化延迟
✅ **解决**: 添加等待机制确保初始化完成

---

## 快速测试

### 第 1 步：切换到国际版

编辑 `.env.local`：

```bash
NEXT_PUBLIC_DEPLOY_REGION=INTL
```

### 第 2 步：启动开发服务器

```bash
npm run dev
```

### 第 3 步：测试邮箱登录

1. 打开 http://localhost:3000/auth
2. 确保在"登录"标签
3. 输入邮箱和密码（任何有效的 Supabase 账户）
4. 点击"登录"

### 预期结果

✅ 登录成功
✅ 页面跳转到首页
✅ 右上角显示用户名

---

## 浏览器检查

打开 DevTools (F12) → Console：

### ✅ 成功日志

```
🔐 使用 Supabase 认证客户端（国际版）
邮箱登录成功，准备跳转...
```

### ❌ 错误日志（修复前会看到）

```
Supabase client not initialized
```

---

## 完整测试场景

### 场景 1：邮箱登录

```
1. 访问 /auth
2. 输入邮箱和密码
3. 点击"登录"
4. 结果：✅ 成功跳转到首页
```

### 场景 2：邮箱注册

```
1. 访问 /auth?mode=signup
2. 输入邮箱、密码和确认密码
3. 点击"注册"
4. 结果：✅ 注册成功，自动登录
```

### 场景 3：页面刷新后仍然登录

```
1. 登录成功后
2. 按 F5 刷新页面
3. 结果：✅ 仍然保持登录状态
```

### 场景 4：中国版不受影响

```
1. 编辑 .env.local
   NEXT_PUBLIC_DEPLOY_REGION=CN
2. 重启服务器
3. 中国版登录流程应正常工作
4. 结果：✅ 不受影响
```

---

## 检查清单

- [ ] `.env.local` 已设置 `NEXT_PUBLIC_DEPLOY_REGION=INTL`
- [ ] 开发服务器已启动
- [ ] 浏览器控制台显示 Supabase 客户端已初始化
- [ ] 邮箱登录页面加载正常
- [ ] 输入邮箱密码后能登录
- [ ] 登录后跳转到首页
- [ ] 右上角显示用户信息
- [ ] localStorage 中有 `auth-token`
- [ ] 刷新页面后仍保持登录

---

## 常见问题排查

### Q: 仍然显示 "Supabase client not initialized"

**A**:

1. 检查环境变量是否正确：
   ```bash
   echo $NEXT_PUBLIC_DEPLOY_REGION  # 应该输出 INTL
   ```
2. 清除浏览器缓存（Ctrl+Shift+Delete）
3. 重启开发服务器（Ctrl+C，然后 npm run dev）

### Q: 登录后没有跳转

**A**:

1. 检查浏览器控制台是否有错误
2. 查看 Network 标签是否有失败的请求
3. 验证 Supabase 的环境变量是否正确

### Q: localStorage 中没有 token

**A**:

1. 检查登录是否真的成功（Console 日志）
2. 尝试清除 localStorage 重新登录
3. 检查浏览器隐私设置是否允许 localStorage

---

## 验证修改

修改的文件：`lib/auth/client.ts`

关键改动：

```typescript
// ✅ 添加了 supabasePromise 缓存
private supabasePromise: Promise<any> | null = null;

// ✅ 添加了 ensureSupabase() 等待机制
private async ensureSupabase() {
  if (this.supabase) {
    return this.supabase;
  }
  if (this.supabasePromise) {
    return await this.supabasePromise;
  }
  throw new Error("Supabase client initialization failed");
}

// ✅ 所有认证方法都使用 await this.ensureSupabase()
async signInWithPassword(params) {
  const supabase = await this.ensureSupabase();
  return await supabase.auth.signInWithPassword(params);
}
```

---

## 下一步

如果测试通过：

1. ✅ 邮箱登录功能恢复
2. ✅ 邮箱注册功能恢复
3. ✅ 可以部署到生产环境

如果仍有问题：

1. 收集错误日志
2. 检查 Supabase 环境配置
3. 验证网络连接

---

## 相关文档

- [SUPABASE_INITIALIZATION_FIX.md](./SUPABASE_INITIALIZATION_FIX.md) - 详细的技术文档
- `.env.local` - 环境变量配置
- `lib/auth/client.ts` - 认证客户端源代码
