# 📱 iOS 前端集成指南 - Apple IAP 新架构

## 前端应该做什么

新架构下，**前端的职责很简单**：

1. ✅ 用户点击"购买" → 调用 iOS StoreKit
2. ✅ iOS StoreKit 返回 transactionId → 发送给后端
3. ✅ 后端确认成功 → 前端刷新用户信息
4. ✅ 显示订阅状态时 → **调用 `GET /api/payment/ios-iap/status`**

## 关键改变

### 旧代码 ❌
```swift
// 从 API 获取用户信息，读取 current_period_end
let profile = await fetchUserProfile()
let expiresAt = profile.current_period_end  // ❌ 可能过期
let daysLeft = calculateDaysLeft(expiresAt) // ❌ 不准确
```

### 新代码 ✅
```swift
// 从专门的 status 端点动态查询 Apple
let status = await fetchSubscriptionStatus()
let expiresAt = status.expiresAt           // ✅ Apple 的真实时间
let daysLeft = status.daysLeft             // ✅ Apple 计算的
```

---

## iOS Swift 实现

### 步骤 1：添加 status 调用

```swift
// 在 IAPManager.swift 或相关文件中添加

func fetchSubscriptionStatus() async -> SubscriptionStatus? {
    guard let token = try? await getAuthToken() else {
        print("❌ 无法获取认证token")
        return nil
    }
    
    var request = URLRequest(url: URL(string: "\(apiBaseURL)/api/payment/ios-iap/status")!)
    request.httpMethod = "GET"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    
    do {
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            print("❌ 无效的响应")
            return nil
        }
        
        if httpResponse.statusCode == 404 {
            print("⚠️ 用户没有有效的 Apple IAP 订阅")
            return nil
        }
        
        if httpResponse.statusCode != 200 {
            print("❌ 查询失败: \(httpResponse.statusCode)")
            return nil
        }
        
        let decoder = JSONDecoder()
        let status = try decoder.decode(SubscriptionStatus.self, from: data)
        
        print("✅ 订阅状态更新: \(status.expiresAt), 剩余 \(status.daysLeft) 天")
        
        return status
    } catch {
        print("❌ 查询失败: \(error)")
        return nil
    }
}
```

### 步骤 2：定义数据模型

```swift
struct SubscriptionStatus: Codable {
    let success: Bool
    let transactionId: String
    let expiresAt: String       // ISO8601 格式
    let expiresAtMs: Int64      // 毫秒时间戳
    let daysLeft: Int           // Apple 计算的剩余天数
    let isExpired: Bool
    let autoRenewStatus: Bool
    let source: String          // "apple" 或 "cached"
}
```

### 步骤 3：支付后刷新

```swift
// 用户支付成功后

func handlePurchaseSuccess(transactionId: String) async {
    // 1. 通知后端
    let confirmResponse = await confirmPurchaseWithBackend(
        transactionId: transactionId,
        productId: productId,
        planId: planId,
        billingCycle: billingCycle
    )
    
    if !confirmResponse.success {
        print("❌ 后端确认失败")
        return
    }
    
    // 2. 立即刷新订阅状态
    if let status = await fetchSubscriptionStatus() {
        // 3. 更新 UI
        updateUIWithStatus(status)
        
        // 4. 保存到本地（可选备份）
        saveCachedStatus(status)
    }
}
```

### 步骤 4：定期检查订阅状态

```swift
// 在 App 启动时、用户返回前台时、每次显示订阅页面时调用

func refreshSubscriptionStatus() async {
    print("🔄 刷新订阅状态...")
    
    if let status = await fetchSubscriptionStatus() {
        print("✅ 订阅状态: 过期于 \(status.expiresAt)")
        print("   剩余天数: \(status.daysLeft)")
        print("   自动续订: \(status.autoRenewStatus)")
        print("   数据来源: \(status.source)")  // 检查是否来自 Apple
        
        if status.source == "cached" {
            print("⚠️  警告: 使用的是缓存数据，可能不是最新的")
        }
        
        updateSubscriptionUI(status)
    } else {
        print("❌ 无法获取订阅状态")
    }
}
```

---

## 显示订阅状态的 UI 示例

```swift
@main
struct SubscriptionView: View {
    @State var status: SubscriptionStatus?
    @State var isLoading = false
    
    var body: some View {
        if let status = status {
            VStack(spacing: 16) {
                // 显示过期时间
                Text("订阅过期时间")
                    .font(.headline)
                
                Text(formatDate(status.expiresAt))
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                // 显示剩余天数
                if status.isExpired {
                    Text("订阅已过期")
                        .foregroundColor(.red)
                } else {
                    Text("剩余 \(status.daysLeft) 天")
                        .foregroundColor(.green)
                }
                
                // 显示自动续订状态
                HStack {
                    Text("自动续订")
                    Spacer()
                    Text(status.autoRenewStatus ? "已开启" : "已关闭")
                        .fontWeight(.bold)
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(8)
                
                // 显示数据来源（调试信息）
                HStack {
                    Text("数据来源")
                    Spacer()
                    if status.source == "apple" {
                        Label("来自 Apple", systemImage: "checkmark.circle.fill")
                            .foregroundColor(.green)
                    } else {
                        Label("缓存数据", systemImage: "exclamationmark.triangle.fill")
                            .foregroundColor(.orange)
                    }
                }
                .font(.caption)
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(8)
                
                // 刷新按钮
                Button(action: refreshStatus) {
                    if isLoading {
                        ProgressView()
                    } else {
                        Label("刷新订阅状态", systemImage: "arrow.clockwise")
                    }
                }
                .disabled(isLoading)
            }
            .padding()
        } else if isLoading {
            ProgressView()
        } else {
            Text("无法加载订阅状态")
                .foregroundColor(.red)
        }
    }
    
    private func refreshStatus() {
        isLoading = true
        Task {
            status = await fetchSubscriptionStatus()
            isLoading = false
        }
    }
    
    private func formatDate(_ dateString: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        if let date = formatter.date(from: dateString) {
            formatter.dateStyle = .medium
            formatter.timeStyle = .short
            return formatter.string(from: date)
        }
        return dateString
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        refreshStatus()
    }
}
```

---

## 关键 API 响应说明

### 成功响应（来自 Apple）
```json
{
  "success": true,
  "transactionId": "2000001109791824",
  "expiresAt": "2025-02-25T12:34:56.000Z",
  "expiresAtMs": 1740487496000,
  "daysLeft": 7,
  "isExpired": false,
  "autoRenewStatus": true,
  "source": "apple"
}
```
✅ 这是最好的情况，数据来自 Apple，完全实时

### 回退响应（Apple 不可用）
```json
{
  "success": true,
  "transactionId": "2000001109791824",
  "expiresAt": "2025-02-25T12:34:56.000Z",
  "daysLeft": 7,
  "isExpired": false,
  "autoRenewStatus": true,
  "source": "cached"
}
```
⚠️ Apple API 暂时不可用，使用上次保存的数据

### 无订阅响应
```json
{
  "success": false,
  "error": "No subscription found",
  "isExpired": true
}
```
❌ 用户没有有效的 Apple IAP 订阅

---

## 关键实现要点

### ✅ 必须做

1. **每次显示订阅信息时调用 status 端点**
   ```swift
   override func viewDidAppear(_ animated: Bool) {
       refreshSubscriptionStatus()  // ✅ 每次都查询
   }
   ```

2. **检查 source 字段，知道数据是否最新**
   ```swift
   if status.source == "apple" {
       // ✅ 数据是最新的
   } else {
       // ⚠️ 数据可能不是最新的
   }
   ```

3. **处理网络错误的降级方案**
   ```swift
   func fetchSubscriptionStatus() async -> SubscriptionStatus? {
       do {
           // 尝试从 API 获取
       } catch {
           // 降级：使用本地缓存（如果有的话）
           return loadCachedStatus()
       }
   }
   ```

### ❌ 不要做

1. **不要从 user profile 读 current_period_end**
   ```swift
   // ❌ 错误：这可能是过期的
   let expiresAt = user.subscription_expires_at
   ```

2. **不要自己计算剩余天数**
   ```swift
   // ❌ 错误：你的时区可能不对
   let daysLeft = calculateDaysLeft(expiresAt)
   
   // ✅ 正确：用 Apple 的计算结果
   let daysLeft = status.daysLeft
   ```

3. **不要仅在付款时调用一次 status**
   ```swift
   // ❌ 错误：只在购买后查询
   handlePurchaseSuccess {
       refreshSubscriptionStatus()  // 仅此一次
   }
   
   // ✅ 正确：定期查询
   // 1. App 启动时
   // 2. 显示订阅页面时
   // 3. 从后台返回时
   // 4. 用户主动刷新时
   ```

---

## 测试检查清单

- [ ] 配置了正确的 Apple API token（从后端获取）
- [ ] 前端有 `/api/payment/ios-iap/status` 的 API 调用
- [ ] 购买后立即调用 status 端点
- [ ] 显示订阅页面时每次都调用 status
- [ ] UI 显示 `daysLeft` 而不是本地计算的天数
- [ ] 检查 `source` 字段，看是否来自 Apple
- [ ] 如果 `source === "cached"`，UI 有警告提示
- [ ] 沙箱测试：购买 → 等待 5 分钟 → 再次刷新 → 显示过期

---

## 常见错误

### ❌ 错误 1：仍然从 user profile 读过期时间
```swift
// 这会导致显示旧数据
let expiresAt = user.subscription_expires_at
```
**修复**：改为调用 `fetchSubscriptionStatus()`

### ❌ 错误 2：status 端点返回 "cached"，前端没有处理
```swift
// 没有向用户显示数据可能不是最新的
if let status = await fetchSubscriptionStatus() {
    updateUI(status)  // 🚫 没有检查 source
}
```
**修复**：
```swift
if let status = await fetchSubscriptionStatus() {
    updateUI(status)
    if status.source == "cached" {
        showWarning("订阅数据可能不是最新的，请检查网络")
    }
}
```

### ❌ 错误 3：自己计算 daysLeft
```swift
// 时区问题！
let daysLeft = Int((status.expiresAtMs - Date().timeIntervalSince1970 * 1000) / (24 * 60 * 60 * 1000))
```
**修复**：直接用 API 返回的 `daysLeft`

---

## 性能优化

### 缓存最后一次结果
```swift
@AppStorage("last_subscription_status") var cachedStatus: String?

func fetchSubscriptionStatus() async -> SubscriptionStatus? {
    do {
        let status = try await API.getSubscriptionStatus()
        // 保存到缓存
        let data = try JSONEncoder().encode(status)
        cachedStatus = String(data: data, encoding: .utf8)
        return status
    } catch {
        // 如果网络失败，返回缓存的数据
        if let cached = cachedStatus {
            return try JSONDecoder().decode(SubscriptionStatus.self, from: cached.data(using: .utf8)!)
        }
        throw error
    }
}
```

### 避免频繁调用
```swift
// 使用 debounce，避免频繁刷新
@State var lastRefreshTime: Date?

func shouldRefreshSubscription() -> Bool {
    if let lastTime = lastRefreshTime {
        // 距离上次刷新少于 5 分钟，就不刷新
        return Date().timeIntervalSince(lastTime) > 300
    }
    return true
}
```

---

**文档版本**：1.0  
**最后更新**：2025-02-18  
**面向**：iOS 开发者  
**状态**：生产就绪 ✅
