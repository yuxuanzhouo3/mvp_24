# 国际化（i18n）实施指南

## ✅ 已完成的基础架构

### 1. 翻译文件系统
```
lib/i18n/
├── index.ts                      # ✅ 工具函数和导出
├── translations/
│   ├── index.ts                  # ✅ 翻译索引
│   ├── zh.ts                     # ✅ 中文翻译（完整）
│   └── en.ts                     # ✅ 英文翻译（完整）
```

### 2. 语言管理组件
```
components/
└── language-provider.tsx         # ✅ 语言提供者（带持久化）
```

### 3. 根布局集成
```
app/layout.tsx                    # ✅ 已集成 LanguageProvider
```

---

## 📋 组件更新步骤

### 通用模式

**更新前的组件**：
```typescript
const t = {
  zh: { title: '标题' },
  en: { title: 'Title' }
}

<h1>{t[language].title}</h1>
```

**更新后的组件**：
```typescript
import { useLanguage } from '@/components/language-provider'
import { useTranslations } from '@/lib/i18n'

export function MyComponent() {
  const { language } = useLanguage()
  const t = useTranslations(language)

  return <h1>{t.header.title}</h1>
}
```

---

## 🔄 需要更新的组件列表

### 高优先级（核心组件）

#### 1. Header 组件
**文件**: `components/header.tsx`

**当前代码**：
```typescript
const t = {
  zh: {
    title: "多AI协作平台",
    workspace: "工作空间",
    library: "AI库",
    export: "导出",
    settings: "设置",
    payment: "订阅",
  },
  en: {
    title: "Multi-GPT Platform",
    workspace: "Workspace",
    library: "AI Library",
    export: "Export",
    settings: "Settings",
    payment: "Subscription",
  },
}
```

**更新步骤**：
1. 导入新的 hooks：
```typescript
import { useLanguage } from '@/components/language-provider'
import { useTranslations } from '@/lib/i18n'
```

2. 删除本地的 `t` 对象

3. 在组件中使用：
```typescript
export function Header({ ... }) {
  const { language, toggleLanguage } = useLanguage()
  const t = useTranslations(language)

  return (
    <header>
      <h1>{t.header.title}</h1>
      <nav>
        <Button onClick={() => setActiveView("workspace")}>
          {t.header.workspace}
        </Button>
        <Button onClick={() => setActiveView("library")}>
          {t.header.library}
        </Button>
        <Button onClick={() => setActiveView("export")}>
          {t.header.export}
        </Button>
      </nav>

      {/* 语言切换按钮 */}
      <Button onClick={toggleLanguage}>
        <Globe className="w-4 h-4" />
        <span>{language === "zh" ? "EN" : "中文"}</span>
      </Button>
    </header>
  )
}
```

---

#### 2. Sidebar 组件
**文件**: `components/sidebar.tsx`

**更新代码**：
```typescript
import { useLanguage } from '@/components/language-provider'
import { useTranslations } from '@/lib/i18n'

export function Sidebar({ ... }) {
  const { language } = useLanguage()
  const t = useTranslations(language)

  return (
    <aside>
      <h3>{t.sidebar.selectedAI}</h3>

      <div className="collaboration-mode">
        <label>{t.sidebar.collaborationMode}</label>
        <select value={collaborationMode} onChange={...}>
          <option value="parallel">{t.sidebar.parallel}</option>
          <option value="sequential">{t.sidebar.sequential}</option>
        </select>
      </div>

      {/* 推荐组合 */}
      <section>
        <h4>{t.sidebar.recommendedCombos}</h4>
        {/* ... */}
      </section>
    </aside>
  )
}
```

---

#### 3. GPTWorkspace 组件
**文件**: `components/gpt-workspace.tsx`

**更新代码**：
```typescript
import { useLanguage } from '@/components/language-provider'
import { useTranslations } from '@/lib/i18n'

export function GPTWorkspace({ selectedGPTs, collaborationMode }: GPTWorkspaceProps) {
  const { language } = useLanguage()
  const t = useTranslations(language)

  return (
    <div className="workspace">
      {/* 欢迎界面 */}
      {messages.length === 0 && selectedGPTs.length === 0 && (
        <div className="welcome">
          <Users className="icon" />
          <h3>{t.workspace.welcome}</h3>
          <p>{t.workspace.selectAI}</p>
        </div>
      )}

      {/* AI就绪界面 */}
      {messages.length === 0 && selectedGPTs.length > 0 && (
        <div className="ready">
          <Bot className="icon" />
          <h3>
            {selectedGPTs.length} AI {t.workspace.aiReady}
          </h3>
          <p>
            {collaborationMode === 'parallel'
              ? t.workspace.parallel
              : t.workspace.sequential}
          </p>
          <p>{t.workspace.example}</p>
        </div>
      )}

      {/* 输入区域 */}
      <div className="input-area">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.workspace.placeholder}
          disabled={isProcessing || selectedGPTs.length === 0}
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || isProcessing}
        >
          {isProcessing ? <Loader2 /> : <Send />}
        </Button>

        <div className="hints">
          <span>
            {selectedGPTs.length} AI {t.workspace.aiSelected}
          </span>
          <span>{t.workspace.enterToSend}</span>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <Card className="error">
          <AlertCircle />
          <div>
            <p>{error}</p>
            <Button onClick={handleRetry}>{t.workspace.retry}</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
```

---

#### 4. GPTLibrary 组件
**文件**: `components/gpt-library.tsx`

**更新代码**：
```typescript
import { useLanguage } from '@/components/language-provider'
import { useTranslations, interpolate } from '@/lib/i18n'

export function GPTLibrary({ ... }) {
  const { language } = useLanguage()
  const t = useTranslations(language)
  const enabledAgents = getEnabledAgents()

  return (
    <div className="library">
      {/* Header */}
      <div>
        <h2>{t.library.title}</h2>
        <p>
          {interpolate(t.library.subtitleWithCount, {
            count: enabledAgents.length
          })}
        </p>
      </div>

      {/* 搜索 */}
      <Input
        placeholder={t.library.search}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* 分类标签 */}
      <TabsList>
        <TabsTrigger value="all">{t.library.categories.all}</TabsTrigger>
        <TabsTrigger value="coding">{t.library.categories.coding}</TabsTrigger>
        <TabsTrigger value="creative">{t.library.categories.creative}</TabsTrigger>
        <TabsTrigger value="analysis">{t.library.categories.analysis}</TabsTrigger>
        <TabsTrigger value="research">{t.library.categories.research}</TabsTrigger>
        <TabsTrigger value="recommended">{t.library.categories.recommended}</TabsTrigger>
      </TabsList>

      {/* AI卡片 */}
      {filteredGPTs.map((gpt) => (
        <Card key={gpt.id}>
          {/* 模型信息 */}
          <div>
            <div className="label">{t.library.model}</div>
            <Badge>{gpt.provider}</Badge>
            <span>{gpt.model}</span>
          </div>

          {/* 能力标签 */}
          <div>
            <div className="label">{t.library.capabilities}</div>
            <div className="badges">
              {gpt.capabilities?.coding && (
                <Badge>{t.library.capabilities.coding}</Badge>
              )}
              {gpt.capabilities?.analysis && (
                <Badge>{t.library.capabilities.analysis}</Badge>
              )}
              {gpt.capabilities?.creative && (
                <Badge>{t.library.capabilities.creative}</Badge>
              )}
            </div>
          </div>

          {/* 添加/移除按钮 */}
          <Button onClick={() => isSelected ? removeGPT(gpt.id) : addGPT(gpt)}>
            {isSelected ? t.library.remove : t.library.add}
          </Button>
        </Card>
      ))}

      {/* 无结果 */}
      {filteredGPTs.length === 0 && (
        <div className="no-results">
          <Search className="icon" />
          <p>{t.library.noResults}</p>
        </div>
      )}

      {/* 选中计数 */}
      {selectedGPTs.length > 0 && (
        <Card className="selected-count">
          <Zap />
          <span>
            {t.library.selected} {selectedGPTs.length} {t.library.aiSelected}
            ({t.library.maxSelected})
          </span>
          <Button onClick={() => setSelectedGPTs([])}>
            {t.library.clearAll}
          </Button>
        </Card>
      )}
    </div>
  )
}
```

---

#### 5. ExportPanel 组件
**文件**: `components/export-panel.tsx`

**更新代码**：
```typescript
import { useLanguage } from '@/components/language-provider'
import { useTranslations } from '@/lib/i18n'

export function ExportPanel({ ... }) {
  const { language } = useLanguage()
  const t = useTranslations(language)

  return (
    <div>
      <h2>{t.export.title}</h2>
      <p>{t.export.subtitle}</p>

      {/* 导出格式 */}
      <section>
        <h3>{t.export.exportFormats}</h3>
        <div className="formats">
          <Button onClick={() => handleExport('pdf')}>
            {t.export.formats.pdf}
          </Button>
          <Button onClick={() => handleExport('docx')}>
            {t.export.formats.docx}
          </Button>
          <Button onClick={() => handleExport('markdown')}>
            {t.export.formats.markdown}
          </Button>
        </div>
      </section>

      {/* 分享选项 */}
      <section>
        <h3>{t.export.shareOptions}</h3>
        <div className="share-channels">
          <Button onClick={() => handleShare('wechat')}>
            {t.export.shareChannels.wechat}
          </Button>
          <Button onClick={() => handleShare('email')}>
            {t.export.shareChannels.email}
          </Button>
        </div>
      </section>
    </div>
  )
}
```

---

#### 6. UserMenu 组件
**文件**: `components/user-menu.tsx`

**更新代码**：
```typescript
import { useLanguage } from '@/components/language-provider'
import { useTranslations } from '@/lib/i18n'

export function UserMenu() {
  const { language } = useLanguage()
  const t = useTranslations(language)

  return (
    <DropdownMenu>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => router.push('/profile')}>
          {t.user.profile}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/settings')}>
          {t.user.settings}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/payment')}>
          {t.user.billing}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          {t.user.logout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

---

#### 7. AICollaborationPanel 组件
**文件**: `components/ai-collaboration-panel.tsx`

**更新代码**：
```typescript
import { useLanguage } from '@/components/language-provider'
import { useTranslations } from '@/lib/i18n'

export function AICollaborationPanel({ selectedGPTs, isProcessing }: AICollaborationPanelProps) {
  const { language } = useLanguage()
  const t = useTranslations(language)

  return (
    <Card>
      <div className="header">
        <Users />
        <h3>{t.collaboration.title}</h3>
      </div>

      {isProcessing && (
        <Badge className="animate-pulse">
          {t.collaboration.autoWorking}
        </Badge>
      )}

      <div className="ai-list">
        {selectedGPTs.map((gpt, index) => {
          const status = getAIStatus(gpt, index)

          return (
            <div key={gpt.id} className="ai-item">
              <div className={`status-icon ${status}`}>
                {status === 'processing' ? <Zap /> :
                 status === 'completed' ? <CheckCircle2 /> :
                 <Clock />}
              </div>

              <div className="info">
                <span>{gpt.name}</span>
                {gpt.type === "organization" && (
                  <Badge>{t.collaboration.members}: {gpt.members?.length || 0}</Badge>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {isProcessing && (
        <div className="working-message">
          {t.collaboration.aiTeamWorking}
        </div>
      )}
    </Card>
  )
}
```

---

### 中优先级（支付相关）

#### 8. SubscriptionPlans 组件
**文件**: `components/payment/subscription-plans.tsx`

**更新代码**：
```typescript
import { useLanguage } from '@/components/language-provider'
import { useTranslations } from '@/lib/i18n'

export function SubscriptionPlans() {
  const { language } = useLanguage()
  const t = useTranslations(language)

  const plans = [
    {
      id: 'free',
      name: t.payment.plans.free.name,
      description: t.payment.plans.free.description,
      price: t.payment.plans.free.price,
      period: t.payment.plans.free.period,
      features: t.payment.plans.free.features,
    },
    {
      id: 'pro',
      name: t.payment.plans.pro.name,
      description: t.payment.plans.pro.description,
      price: t.payment.plans.pro.price,
      period: t.payment.plans.pro.period,
      features: t.payment.plans.pro.features,
    },
    {
      id: 'enterprise',
      name: t.payment.plans.enterprise.name,
      description: t.payment.plans.enterprise.description,
      price: t.payment.plans.enterprise.price,
      period: t.payment.plans.enterprise.period,
      features: t.payment.plans.enterprise.features,
    },
  ]

  return (
    <div>
      <h2>{t.payment.title}</h2>
      <p>{t.payment.subtitle}</p>

      <div className="plans-grid">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <h3>{plan.name}</h3>
            <p>{plan.description}</p>
            <div className="price">
              {plan.price}
              {plan.period && <span>{plan.period}</span>}
            </div>
            <ul>
              {plan.features.map((feature, i) => (
                <li key={i}>{feature}</li>
              ))}
            </ul>
            <Button>{t.payment.subscribe}</Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

---

#### 9. PaymentForm 组件
**文件**: `components/payment/payment-form.tsx`

**更新代码**：
```typescript
import { useLanguage } from '@/components/language-provider'
import { useTranslations } from '@/lib/i18n'

export function PaymentForm() {
  const { language } = useLanguage()
  const t = useTranslations(language)

  const paymentMethods = [
    {
      id: 'stripe',
      name: t.payment.methods.stripe.name,
      description: t.payment.methods.stripe.description,
    },
    {
      id: 'wechat',
      name: t.payment.methods.wechat.name,
      description: t.payment.methods.wechat.description,
    },
    {
      id: 'alipay',
      name: t.payment.methods.alipay.name,
      description: t.payment.methods.alipay.description,
    },
    {
      id: 'paypal',
      name: t.payment.methods.paypal.name,
      description: t.payment.methods.paypal.description,
    },
  ]

  return (
    <div>
      {paymentMethods.map((method) => (
        <Card key={method.id} onClick={() => setSelectedMethod(method.id)}>
          <h4>{method.name}</h4>
          <p>{method.description}</p>
        </Card>
      ))}

      <Button onClick={handlePayment}>
        {isProcessing ? t.payment.messages.processing : t.common.confirm}
      </Button>
    </div>
  )
}
```

---

## 🔧 AI配置文件的处理

**文件**: `lib/ai/ai-agents.config.ts`

AI配置文件中已经有 `nameEn`, `roleEn`, `descriptionEn` 字段，但它们是可选的。

**建议**：保持当前结构，在组件中根据语言动态选择：

```typescript
// 在 GPTLibrary 组件中
const getAIName = (agent: AIAgentConfig, language: Language) => {
  return language === 'en' && agent.nameEn ? agent.nameEn : agent.name
}

const getAIRole = (agent: AIAgentConfig, language: Language) => {
  return language === 'en' && agent.roleEn ? agent.roleEn : agent.role
}

const getAIDescription = (agent: AIAgentConfig, language: Language) => {
  return language === 'en' && agent.descriptionEn ? agent.descriptionEn : agent.description
}

// 使用
<h3>{getAIName(agent, language)}</h3>
<p>{getAIRole(agent, language)}</p>
<div>{getAIDescription(agent, language)}</div>
```

**或者创建一个工具函数**：

```typescript
// lib/ai/ai-agents.config.ts 底部添加
export function getLocalizedAI(agent: AIAgentConfig, language: Language) {
  if (language === 'en') {
    return {
      ...agent,
      name: agent.nameEn || agent.name,
      role: agent.roleEn || agent.role,
      description: agent.descriptionEn || agent.description,
    }
  }
  return agent
}
```

---

## 📝 更新检查清单

### 已完成 ✅
- [x] 创建翻译文件系统 (`lib/i18n/`)
- [x] 创建 LanguageProvider 组件
- [x] 集成到 app/layout.tsx
- [x] 提供完整的中英文翻译

### 待完成 ⏳
- [ ] Header 组件
- [ ] Sidebar 组件
- [ ] GPTWorkspace 组件
- [ ] GPTLibrary 组件
- [ ] ExportPanel 组件
- [ ] UserMenu 组件
- [ ] AICollaborationPanel 组件
- [ ] SubscriptionPlans 组件
- [ ] PaymentForm 组件
- [ ] 其他页面组件（auth/page.tsx, settings/page.tsx 等）

### 测试 🧪
- [ ] 测试中英文切换
- [ ] 测试语言持久化（刷新页面）
- [ ] 测试地理位置自动检测
- [ ] 测试所有页面的翻译完整性

---

## 🚀 快速开始

### 1. 更新单个组件的步骤

```bash
# 1. 打开组件文件
# 2. 添加导入
import { useLanguage } from '@/components/language-provider'
import { useTranslations } from '@/lib/i18n'

# 3. 删除本地 t 对象
# 4. 在组件中使用
const { language } = useLanguage()
const t = useTranslations(language)

# 5. 替换所有 t[language].xxx 为 t.xxx
# 6. 测试
```

### 2. 测试语言切换

```typescript
// 在任意组件中
import { useLanguage } from '@/components/language-provider'

const { language, setLanguage, toggleLanguage } = useLanguage()

// 切换语言
<Button onClick={toggleLanguage}>
  {language === 'zh' ? 'EN' : '中文'}
</Button>
```

### 3. 添加新翻译

如果需要添加新的翻译键：

1. 在 `lib/i18n/translations/zh.ts` 中添加中文
2. 在 `lib/i18n/translations/en.ts` 中添加英文
3. TypeScript 会自动检查类型一致性

---

## 💡 最佳实践

### 1. 使用嵌套翻译路径
```typescript
// 好 ✅
t.workspace.placeholder
t.library.categories.all

// 不好 ❌
t.workspace_placeholder
t.library_categories_all
```

### 2. 使用 interpolate 处理动态文本
```typescript
import { interpolate } from '@/lib/i18n'

// 翻译文件中
{
  subtitleWithCount: '选择专业的AI智能体来协作完成您的写作任务 ({count}个可用)'
}

// 使用
interpolate(t.library.subtitleWithCount, { count: enabledAgents.length })
```

### 3. 保持翻译文件同步
- 中英文翻译的键必须完全一致
- TypeScript 会在编译时检查
- 缺失的翻译会在控制台警告

---

## 🎯 下一步

1. **按优先级更新组件**
   - 先更新核心组件（Header, Sidebar, GPTWorkspace）
   - 再更新次要组件
   - 最后更新页面组件

2. **测试每个组件**
   - 更新一个，测试一个
   - 确保中英文都正确显示

3. **完善翻译**
   - 根据实际使用补充缺失的翻译
   - 优化翻译质量

---

## 📞 需要帮助？

如果在更新过程中遇到问题：

1. **翻译键找不到**
   - 检查 `lib/i18n/translations/zh.ts`
   - 确保路径正确（如 `t.workspace.placeholder`）

2. **类型错误**
   - 确保中英文翻译文件的键完全一致
   - 运行 `npm run type-check`

3. **语言不持久化**
   - 检查 localStorage 是否启用
   - 检查浏览器控制台的错误信息

---

**祝你顺利完成国际化改造！🎉**
