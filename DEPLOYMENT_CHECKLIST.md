# 部署检查清单

## 前置准备

- [ ] 所有代码修改已提交到本地仓库
- [ ] 代码已进行代码审查
- [ ] 已备份生产数据库
- [ ] 已通知相关团队

## 数据库迁移

### Supabase（国际版）

```bash
# 1. 检查迁移文件存在
ls supabase/migrations/20251120000000_add_multi_ai_config.sql

# 2. 在测试环境运行迁移
npx supabase migration up --linked

# 3. 验证迁移成功
# 在Supabase控制台检查：
# - gpt_sessions 表是否有 multi_ai_config 列
# - 索引是否创建成功
```

**检查项**:
- [ ] multi_ai_config 列已创建（JSONB类型）
- [ ] idx_gpt_sessions_multi_ai_config 索引已创建
- [ ] idx_gpt_sessions_is_multi_ai 索引已创建

### CloudBase（国内版）

参考文件：`cloudbase/migrations/20251120_add_multi_ai_config.md`

```bash
# 1. 在CloudBase控制台手动执行：
# - 打开 ai_conversations 集合
# - 添加字段 multi_ai_config（类型：对象）
# - 创建索引

# 2. 或使用CloudBase Admin工具
cloudbase migrate --env-id <ENV_ID>
```

**检查项**:
- [ ] ai_conversations 集合中添加了 multi_ai_config 字段
- [ ] 复合索引 (user_id, multi_ai_config.isMultiAI) 已创建

## 代码部署

### 1. 后端API服务

**受影响文件**:
```
app/api/chat/sessions/route.ts
app/api/chat/send/route.ts
lib/cloudbase-db.ts
```

**部署步骤**:
```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装依赖（如有新增）
npm install

# 3. 构建
npm run build

# 4. 测试API端点
# 运行单元测试
npm run test api/chat

# 5. 部署
# 使用你的部署工具（Vercel, Docker, etc.）
```

**验证清单**:
- [ ] `/api/chat/sessions` POST 端点正常工作
- [ ] 可以创建多AI会话（传递isMultiAI=true）
- [ ] 多AI会话保存了 multi_ai_config
- [ ] `/api/chat/send` 验证agentId
- [ ] 历史消息过滤正常工作
- [ ] 单AI会话仍然正常

### 2. 前端代码

**受影响文件**:
```
components/gpt-workspace.tsx
components/chat-toolbar.tsx
```

**部署步骤**:
```bash
# 1. 构建前端
npm run build

# 2. 测试
npm run dev

# 3. 验证UI更改
# 打开浏览器开发工具
# 检查网络请求和控制台日志

# 4. 部署（如分离的前端）
npm run deploy
```

**验证清单**:
- [ ] 创建单AI会话 - AI选择器保持启用
- [ ] 创建多AI会话 - AI选择器被禁用
- [ ] 锁定状态显示 🔒 图标
- [ ] 无法移除已锁定的AI
- [ ] 切换会话时锁定状态正确
- [ ] 创建新会话时选择器重新启用
- [ ] 错误处理和用户提示正常

## 生产环境验证

### 1. 冒烟测试（Smoke Test）

**测试场景1：单AI对话**
```
1. 打开应用
2. 选择单个AI
3. 发送消息
4. 验证：响应正常，AI选择器可用
```

- [ ] 单AI对话功能正常
- [ ] 可以改变AI
- [ ] 消息保存成功

**测试场景2：多AI对话**
```
1. 打开应用
2. 选择2个以上的AI
3. 发送消息
4. 验证：所有AI都回复，配置被锁定
```

- [ ] 多AI协作功能正常
- [ ] 所有选中的AI都有回复
- [ ] AI选择器被禁用
- [ ] 显示锁定提示信息

**测试场景3：上下文隔离**
```
1. 在多AI会话中发送多条消息
2. 检查每个AI的回复
3. 验证：每个AI只看到自己的历史
```

- [ ] AI回复相互独立
- [ ] 没有混淆的上下文
- [ ] 对话流畅自然

**测试场景4：新会话创建**
```
1. 在多AI会话中
2. 点击"新建会话"
3. 选择不同的AI
4. 验证：可以创建新的多AI组合
```

- [ ] 新会话创建成功
- [ ] AI选择器重新启用
- [ ] 新会话配置独立保存

### 2. 性能测试

```bash
# 1. 监测API响应时间
# 创建会话：应 < 500ms
# 发送消息：应 < 2000ms（包括AI响应时间）
# 加载历史：应 < 1000ms

# 2. 监测数据库查询
# 检查新索引使用情况
# 验证查询性能改进
```

**验证清单**:
- [ ] 创建会话延迟 < 500ms
- [ ] 发送消息延迟 < 2000ms
- [ ] 加载消息延迟 < 1000ms
- [ ] 数据库查询性能无下降

### 3. 错误处理测试

```
1. 尝试用错误的agentId发送消息
   → 应返回 409 Conflict

2. 尝试改变已锁定的会话的AI
   → 前端应禁用，后端应验证

3. 加载不存在的消息
   → 应返回空数组，不出错

4. 多个AI同时请求不同模型
   → 应正确路由到各自的Provider
```

**验证清单**:
- [ ] 409 Conflict 错误正确处理
- [ ] 前后端验证一致
- [ ] 错误消息清晰
- [ ] 不会导致系统崩溃

### 4. 兼容性测试

```
1. 测试旧的单AI会话
   → 应无 multi_ai_config
   → AI选择器应启用
   → 功能应正常

2. 测试旧的多AI消息格式
   → 应被正确过滤
   → 应无上下文污染
```

**验证清单**:
- [ ] 旧会话兼容
- [ ] 旧消息格式兼容
- [ ] 迁移路径清晰

## 监测和告警

### 1. 关键指标

```
- 错误率：监测409错误率（应 < 1%）
- 性能：监测API延迟（应稳定）
- 用户行为：监测多AI会话创建率
- 数据库：监测新索引使用情况
```

### 2. 告警配置

```
告警条件：
- 409错误率 > 5% → 可能有问题
- API延迟 > 3000ms → 性能下降
- 数据库查询失败率 > 1% → 数据库问题
```

## 回滚计划

如果出现问题，按以下步骤回滚：

### 代码回滚
```bash
# 1. 回滚到前一个版本
git revert <commit-hash>
git push origin main

# 2. 重新部署
npm run build && npm run deploy
```

### 数据库回滚

**Supabase**:
```sql
-- 恢复迁移
ALTER TABLE gpt_sessions DROP COLUMN IF EXISTS multi_ai_config;
DROP INDEX IF EXISTS idx_gpt_sessions_multi_ai_config;
DROP INDEX IF EXISTS idx_gpt_sessions_is_multi_ai;
```

**CloudBase**:
```
1. 在CloudBase控制台删除 multi_ai_config 字段
2. 删除相关索引
```

**重要提示**: 确保在回滚前备份数据

## 检查清单总结

### 部署前
- [ ] 所有测试通过
- [ ] 代码审查完成
- [ ] 文档更新完成
- [ ] 备份已创建

### 数据库
- [ ] Supabase 迁移成功
- [ ] CloudBase 字段添加成功
- [ ] 索引创建成功
- [ ] 性能测试通过

### 代码
- [ ] 后端部署成功
- [ ] 前端部署成功
- [ ] 构建无错误
- [ ] 部署无错误

### 验证
- [ ] 冒烟测试全部通过
- [ ] 性能测试通过
- [ ] 错误处理测试通过
- [ ] 兼容性测试通过

### 监测
- [ ] 监测系统配置正确
- [ ] 告警规则已启用
- [ ] 日志正常记录
- [ ] 支持团队已通知

## 联系方式

如遇到问题，请联系：
- **技术支持**: [团队联系方式]
- **紧急回滚**: [值班电话]
- **数据库**:  [DBA联系方式]

---

**部署日期**: _________
**部署人员**: _________
**验证人员**: _________
**备注**: _________
