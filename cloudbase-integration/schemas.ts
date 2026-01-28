/**
 * CloudBase 数据库集合结构定义
 * 所有集合都使用 JSON Lines 格式，每行一个JSON对象
 */

// web_users.json - 用户表
export const WEB_USERS_SCHEMA = `{"_id":"example_user_1","email":"example@qq.com","password_hash":"$2a$12$exampleHashWillBeReplacedByRealUserData","nickname":"示例用户","avatar":"","is_pro":false,"region":"china","created_at":{"$date":"2025-01-23T00:00:00.000Z"},"updated_at":{"$date":"2025-01-23T00:00:00.000Z"}}`

// web_favorites.json - 收藏表
export const WEB_FAVORITES_SCHEMA = `{"_id":"example_favorite_1","user_id":"example_user_1","site_id":"site_001","created_at":{"$date":"2025-01-23T00:00:00.000Z"}}`

// web_custom_sites.json - 自定义网站表
export const WEB_CUSTOM_SITES_SCHEMA = `{"_id":"example_custom_site_1","user_id":"example_user_1","name":"示例网站","url":"https://example.com","logo":"https://example.com/logo.png","category":"工具","description":"这是一个示例自定义网站","created_at":{"$date":"2025-01-23T00:00:00.000Z"},"updated_at":{"$date":"2025-01-23T00:00:00.000Z"}}`

// web_subscriptions.json - 订阅表
export const WEB_SUBSCRIPTIONS_SCHEMA = `{"_id":"example_subscription_1","user_id":"example_user_1","plan_type":"pro","billing_cycle":"monthly","status":"active","payment_method":"wechat","start_time":{"$date":"2025-01-23T00:00:00.000Z"},"expire_time":{"$date":"2025-02-23T00:00:00.000Z"},"auto_renew":false,"transaction_id":"txn_example_001","created_at":{"$date":"2025-01-23T00:00:00.000Z"},"updated_at":{"$date":"2025-01-23T00:00:00.000Z"}}`

// web_payment_transactions.json - 支付记录表
export const WEB_PAYMENT_TRANSACTIONS_SCHEMA = `{"_id":"example_transaction_1","user_id":"example_user_1","product_name":"sitehub","plan_type":"pro","billing_cycle":"monthly","payment_method":"wechat","payment_status":"completed","transaction_type":"purchase","currency":"CNY","gross_amount":2900,"payment_fee":87,"net_amount":2813,"profit":1813,"transaction_id":"txn_example_001","payment_time":{"$date":"2025-01-23T00:00:00.000Z"},"created_at":{"$date":"2025-01-23T00:00:00.000Z"}}`

/**
 * 集合字段说明
 */
export const SCHEMA_DESCRIPTIONS = {
  web_users: {
    _id: '文档ID（自动生成）',
    email: '用户邮箱（唯一索引）',
    password: 'bcrypt加密的密码',
    name: '用户名',
    pro: '是否会员（false=免费用户，true=付费会员）',
    region: '固定为 "china"（区分官网国内用户）',
    createdAt: '创建时间',
    updatedAt: '更新时间'
  },
  web_favorites: {
    _id: '文档ID（自动生成）',
    user_id: '关联 web_users._id',
    site_id: '网站ID（对应官网的网站库）',
    created_at: '收藏时间'
  },
  web_custom_sites: {
    _id: '文档ID（自动生成）',
    user_id: '关联 web_users._id',
    name: '网站名称',
    url: '网站链接',
    logo: '网站图标',
    category: '分类（如：工具、社交、娱乐等）',
    description: '网站描述',
    created_at: '创建时间',
    updated_at: '更新时间'
  },
  web_subscriptions: {
    _id: '文档ID（自动生成）',
    user_id: '关联 web_users._id',
    plan_type: '套餐类型（"pro" 或 "team"）',
    billing_cycle: '计费周期（"monthly" 或 "yearly"）',
    status: '订阅状态（"active" 或 "expired"）',
    payment_method: '支付方式（"wechat" 或 "alipay"）',
    start_time: '开始时间',
    expire_time: '到期时间',
    auto_renew: '是否自动续费',
    transaction_id: '关联的交易ID',
    created_at: '创建时间',
    updated_at: '更新时间'
  },
  web_payment_transactions: {
    _id: '文档ID（自动生成）',
    user_id: '关联 web_users._id',
    product_name: '产品名称',
    plan_type: '套餐类型',
    billing_cycle: '计费周期',
    payment_method: '支付方式',
    payment_status: '支付状态（"completed" 或 "pending"）',
    transaction_type: '交易类型（"purchase" 或 "refund"）',
    currency: '货币类型（"CNY"）',
    gross_amount: '总金额（单位：分）',
    payment_fee: '平台手续费',
    net_amount: '实际到账金额',
    profit: '纯利润',
    transaction_id: '交易ID',
    payment_time: '支付时间',
    created_at: '创建时间'
  }
}