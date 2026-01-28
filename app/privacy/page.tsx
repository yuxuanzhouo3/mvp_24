"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { isChinaRegion } from "@/lib/config/region";

export default function LegalPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const [isChina, setIsChina] = useState(false);

  useEffect(() => {
    setIsChina(isChinaRegion());
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="flex items-center space-x-2 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{language === "zh" ? "返回" : "Back"}</span>
        </Button>

        <div className="bg-white rounded-lg shadow-sm p-8">
          <h1 className="text-3xl font-bold mb-2">
            {language === "zh" ? "法律与政策" : "Legal"}
          </h1>
          <p className="text-gray-600 mb-8">
            {language === "zh"
              ? "最后更新：2024年11月"
              : "Last updated: November 2024"}
          </p>

          {/* 标签页 */}
          <Tabs defaultValue="terms" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8">
              <TabsTrigger value="terms">
                {language === "zh" ? "服务条款" : "Terms"}
              </TabsTrigger>
              <TabsTrigger value="privacy">
                {language === "zh" ? "隐私政策" : "Privacy"}
              </TabsTrigger>
              <TabsTrigger value="refund">
                {language === "zh" ? "退款政策" : "Refund"}
              </TabsTrigger>
            </TabsList>

            {/* 服务条款 */}
            <TabsContent value="terms" className="space-y-6">
              {isChina ? (
                <div className="prose prose-sm max-w-none space-y-6">
                  {/* 服务描述 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      1. 服务描述
                    </h2>
                    <p className="text-gray-700">
                      MultiGPT 是多功能 AI 服务平台，为用户提供便捷的 AI
                      对话、模型调用和管理服务。我们的服务包括但不限于：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>
                        <strong>AI 对话与任务处理</strong> - 与多个 AI
                        模型进行实时对话
                      </li>
                      <li>
                        <strong>自定义提示词与模型管理</strong> -
                        创建和管理个性化提示词
                      </li>
                      <li>
                        <strong>跨设备数据同步</strong> -
                        在多设备间无缝同步对话记录
                      </li>
                      <li>
                        <strong>高级搜索和记录管理功能</strong> -
                        快速查询和整理对话历史
                      </li>
                    </ul>
                  </section>

                  {/* 用户账户 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      2. 用户账户
                    </h2>
                    <p className="text-gray-700">
                      为了使用 MultiGPT
                      的完整功能，您需要注册一个账户。注册时，您需要提供准确的个人信息，并负责保护您的账户安全。
                    </p>
                    <p className="text-gray-700 font-semibold mt-4">您同意：</p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>提供真实、准确、完整的注册信息</li>
                      <li>及时更新个人信息以保持准确性</li>
                      <li>保护您的账户密码安全</li>
                      <li>对您账户下的所有活动负责</li>
                    </ul>
                  </section>

                  {/* 服务使用 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      3. 服务使用
                    </h2>
                    <p className="text-gray-700">
                      您可以使用 MultiGPT 的免费功能，高级功能需要付费订阅。
                    </p>
                    <p className="text-gray-700 font-semibold mt-4">
                      使用服务时，您同意：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>遵守相关法律法规</li>
                      <li>不得滥用平台功能</li>
                      <li>不得进行任何可能损害平台安全的行为</li>
                      <li>尊重其他用户的权利</li>
                    </ul>
                  </section>

                  {/* 付费服务 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      4. 付费服务
                    </h2>
                    <p className="text-gray-700 mb-4">
                      MultiGPT
                      提供以下付费订阅计划（具体价格以应用内显示为准）：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>
                        <strong>个人会员：</strong>¥19.99/月，¥168/年
                      </li>
                    </ul>
                    <p className="text-gray-700 mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                      <strong>重要说明：</strong>MultiGPT
                      不提供自动续费功能。所有订阅均为用户主动购买，订阅到期后不会自动扣费。您可以随时取消订阅而无需承诺。
                    </p>
                  </section>

                  {/* 知识产权 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      5. 知识产权
                    </h2>
                    <p className="text-gray-700">
                      MultiGPT
                      平台及其原创内容、功能和设计受知识产权法保护。未经许可，您不得：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>复制、修改或分发我们的内容</li>
                      <li>反向工程我们的软件</li>
                      <li>使用我们的商标或标识</li>
                    </ul>
                  </section>

                  {/* 隐私保护 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      6. 隐私保护
                    </h2>
                    <p className="text-gray-700">
                      我们重视您的隐私。详细内容请查看本页面的《隐私政策》标签。我们承诺：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>保护您的个人信息安全</li>
                      <li>仅在必要时收集信息</li>
                      <li>不会出售您的个人信息</li>
                    </ul>
                  </section>

                  {/* 服务变更与终止 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      7. 服务变更与终止
                    </h2>
                    <p className="text-gray-700">
                      我们保留随时修改或终止服务的权利。在合理情况下，我们会提前通知用户。如果您违反本条款，我们可能立即终止您的账户。
                    </p>
                  </section>

                  {/* 免责声明 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      8. 免责声明
                    </h2>
                    <p className="text-gray-700">
                      在法律允许的最大范围内，MultiGPT 不承担以下责任：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>服务中断或数据丢失</li>
                      <li>第三方网站的可用性或内容</li>
                      <li>间接或偶然损失</li>
                    </ul>
                  </section>

                  {/* 争议解决 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      9. 争议解决
                    </h2>
                    <p className="text-gray-700">
                      本条款受中华人民共和国法律管辖。如发生争议，双方应友好协商解决；协商不成的，可向有管辖权的人民法院提起诉讼。
                    </p>
                  </section>

                  {/* 条款更新 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      10. 条款更新
                    </h2>
                    <p className="text-gray-700">
                      我们可能不时更新本条款。重大变更将通过应用内通知或邮件告知用户。继续使用服务即表示您接受更新后的条款。
                    </p>
                  </section>

                  {/* 联系我们 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      11. 联系我们
                    </h2>
                    <p className="text-gray-700">
                      如对本服务条款有任何疑问，请联系：
                    </p>
                    <div className="bg-gray-100 p-6 rounded-lg mt-4">
                      <p className="text-gray-700">
                        <strong>邮箱：</strong>mornscience@gmail.com
                      </p>
                      <p className="text-gray-700 mt-2">
                        <strong>工作时间：</strong>周一至周五 9:00-18:00
                      </p>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none space-y-6">
                  {/* Service */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">Service</h2>
                    <p className="text-gray-700">
                      MultiGPT provides AI chat functionality. Users can input
                      text and receive AI-generated responses. These responses
                      are for general informational purposes only and should not
                      be relied upon as professional advice.
                    </p>
                  </section>

                  {/* User Account */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      User Account
                    </h2>
                    <p className="text-gray-700">
                      Users may log in via WeChat, Email, or other provided
                      methods. You must keep your account credentials secure and
                      are fully responsible for all activity under your account.
                    </p>
                  </section>

                  {/* Usage Rules */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      Usage Rules
                    </h2>
                    <p className="text-gray-700">You agree not to:</p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>Use MultiGPT for illegal activities or content</li>
                      <li>Harass, defraud, threaten, or attack others</li>
                      <li>Attempt to access, damage, or disrupt the system</li>
                      <li>
                        Abuse AI generation or attempt to bypass limitations
                      </li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                      Accounts violating these rules may be suspended or
                      terminated.
                    </p>
                  </section>

                  {/* Payment (One-Time Purchase) */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      Payment (One-Time Purchase)
                    </h2>
                    <p className="text-gray-700">
                      MultiGPT International offers only a one-time purchase to
                      unlock the premium version. There are no subscriptions and
                      no automatic renewals. Payment is non-recurring unless
                      explicitly stated.
                    </p>
                  </section>

                  {/* AI Output Disclaimer */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      AI Output Disclaimer
                    </h2>
                    <p className="text-gray-700">
                      AI-generated responses may contain errors, inaccuracies,
                      or outdated information. Users must independently verify
                      any content before relying on it. MultiGPT is not liable
                      for decisions made based on AI output.
                    </p>
                  </section>

                  {/* Service Changes */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      Service Changes
                    </h2>
                    <p className="text-gray-700">
                      We may update, modify, or suspend services at any time
                      without prior notice. Critical updates will be
                      communicated when possible.
                    </p>
                  </section>

                  {/* Limitation of Liability */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      Limitation of Liability
                    </h2>
                    <p className="text-gray-700">
                      MultiGPT is not responsible for:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>Data loss or corruption</li>
                      <li>AI output errors</li>
                      <li>Network, device, or connectivity issues</li>
                      <li>Third-party service failures</li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                      Maximum liability to any user is limited to the amount
                      paid for the service. This does not affect non-excludable
                      legal rights in your jurisdiction.
                    </p>
                  </section>

                  {/* Governing Law and Jurisdiction */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      Governing Law and Jurisdiction
                    </h2>
                    <p className="text-gray-700">
                      These terms are governed by the laws of Singapore or the
                      United States, applied automatically based on your
                      location. Any disputes shall be resolved in the
                      appropriate courts of the governing jurisdiction.
                    </p>
                  </section>
                </div>
              )}
            </TabsContent>

            {/* 隐私政策 */}
            <TabsContent value="privacy" className="space-y-6">
              {isChina ? (
                <div className="prose prose-sm max-w-none space-y-6">
                  {/* 信息收集 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      1. 信息收集
                    </h2>
                    <p className="text-gray-700">我们收集以下类型的信息：</p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>
                        <strong>账户信息：</strong>
                        邮箱、用户名、密码（加密存储）、微信昵称、头像、OpenID
                      </li>
                      <li>
                        <strong>使用数据：</strong>
                        对话记录、收藏内容、访问记录、搜索历史
                      </li>
                      <li>
                        <strong>设备信息：</strong>
                        设备型号、操作系统版本、浏览器类型、IP地址
                      </li>
                      <li>
                        <strong>位置信息：</strong>
                        用于推荐本地化内容（可选，用户可拒绝）
                      </li>
                    </ul>
                  </section>

                  {/* 信息使用 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      2. 信息使用
                    </h2>
                    <p className="text-gray-700">我们使用收集的信息用于：</p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>提供和改善服务</li>
                      <li>个性化用户体验</li>
                      <li>技术支持和客服服务</li>
                      <li>安全监控和欺诈防护</li>
                    </ul>
                  </section>

                  {/* 信息保护 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      3. 信息保护
                    </h2>
                    <p className="text-gray-700">
                      我们采用行业标准的安全措施保护您的信息：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>数据加密传输和存储</li>
                      <li>访问控制和身份验证</li>
                      <li>定期安全审计</li>
                      <li>员工保密培训</li>
                    </ul>
                  </section>

                  {/* 信息共享 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      4. 信息共享
                    </h2>
                    <p className="text-gray-700">
                      我们不会出售、出租或交易您的个人信息。仅在以下情况下共享：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>获得您的明确同意</li>
                      <li>法律要求或法院命令</li>
                      <li>保护我们的权利和财产</li>
                      <li>与可信第三方服务提供商（如支付处理）</li>
                    </ul>
                  </section>

                  {/* 数据保留 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      5. 数据保留
                    </h2>
                    <p className="text-gray-700">
                      我们根据以下原则保留您的数据：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>
                        <strong>账户信息：</strong>账户存在期间
                      </li>
                      <li>
                        <strong>使用数据：</strong>最多 3 年
                      </li>
                      <li>
                        <strong>法律要求：</strong>根据相关法律要求（如税务记录
                        7 年）
                      </li>
                    </ul>
                  </section>

                  {/* 您的权利 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      6. 您的权利
                    </h2>
                    <p className="text-gray-700">
                      根据《个人信息保护法》，您拥有以下权利：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>
                        <strong>访问权：</strong>查看和访问您的个人信息
                      </li>
                      <li>
                        <strong>更正权：</strong>更正不准确的信息
                      </li>
                      <li>
                        <strong>删除权：</strong>删除您的账户和数据
                      </li>
                      <li>
                        <strong>限制权：</strong>限制信息处理
                      </li>
                      <li>
                        <strong>携带权：</strong>
                        获取您的数据副本并转移至其他服务
                      </li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                      如需行使这些权利，请发送邮件至
                      mornscience@gmail.com，我们将在 30
                      个工作日内处理您的请求。
                    </p>
                  </section>

                  {/* Cookie 和跟踪技术 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      7. Cookie 和跟踪技术
                    </h2>
                    <p className="text-gray-700">
                      我们使用 Cookie 和类似技术来：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>记住您的偏好设置</li>
                      <li>分析使用模式</li>
                      <li>改善用户体验</li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                      您可以通过浏览器设置管理 Cookie 偏好。
                    </p>
                  </section>

                  {/* 儿童隐私 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      8. 儿童隐私
                    </h2>
                    <p className="text-gray-700">
                      我们的服务不针对 14
                      岁以下的儿童。如果我们发现收集了儿童的个人信息，将立即删除。
                    </p>
                  </section>

                  {/* 隐私政策更新 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      9. 隐私政策更新
                    </h2>
                    <p className="text-gray-700">
                      我们可能不时更新本隐私政策。重大变更将通过应用内通知告知您。
                    </p>
                  </section>

                  {/* 联系我们 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      10. 联系我们
                    </h2>
                    <p className="text-gray-700">
                      如果您对本隐私政策有任何疑问，请发送邮件至：
                    </p>
                    <div className="bg-gray-100 p-6 rounded-lg mt-4">
                      <p className="text-gray-700">
                        <strong>邮箱：</strong>mornscience@gmail.com
                      </p>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none space-y-6">
                  {/* Information We Collect */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      Information We Collect
                    </h2>
                    <p className="text-gray-700">
                      We collect only information necessary to provide chat
                      services:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>
                        Login credentials (WeChat nickname, avatar, OpenID, or
                        Email)
                      </li>
                      <li>
                        Chat content (used for AI responses; can be deleted at
                        any time)
                      </li>
                      <li>Basic device information (model, OS version)</li>
                      <li>
                        Payment records (processed via WeChat / Alipay / Stripe
                        / PayPal)
                      </li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                      We do not collect advertising, analytics, or tracking
                      data.
                    </p>
                  </section>

                  {/* How We Use Data */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      How We Use Data
                    </h2>
                    <p className="text-gray-700">Data is used to:</p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>Provide AI chat services</li>
                      <li>Verify and manage payment status</li>
                      <li>Deliver basic customer support</li>
                      <li>Ensure service security</li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                      We do not sell or share user data with third parties.
                    </p>
                  </section>

                  {/* Data Storage and Security */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      Data Storage and Security
                    </h2>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>
                        <strong>International:</strong> Supabase
                      </li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                      All data is encrypted during transmission and at rest.
                    </p>
                  </section>

                  {/* User Rights */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      User Rights
                    </h2>
                    <p className="text-gray-700">Users may at any time:</p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>Delete individual chats</li>
                      <li>Delete their account</li>
                      <li>
                        Request complete deletion of personal data by emailing:
                        mornscience@gmail.com
                      </li>
                    </ul>
                  </section>

                  {/* Children */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">Children</h2>
                    <p className="text-gray-700">
                      Services are not intended for children under 13. Parents
                      or guardians should ensure compliance.
                    </p>
                  </section>

                  {/* Policy Updates */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      Policy Updates
                    </h2>
                    <p className="text-gray-700">
                      We may update this policy; users will be informed of
                      significant changes.
                    </p>
                  </section>
                </div>
              )}
            </TabsContent>

            {/* 退款政策 */}
            <TabsContent value="refund" className="space-y-6">
              {isChina ? (
                <div className="prose prose-sm max-w-none space-y-6">
                  {/* 退款条件 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      1. 退款条件
                    </h2>
                    <p className="text-gray-700">
                      在以下情况下，您可以申请退款：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>
                        <strong>重复扣费：</strong>
                        首次自动续费或系统错误导致的重复扣费
                      </li>
                      <li>
                        <strong>服务故障：</strong>连续 7 天无法正常使用服务
                      </li>
                      <li>
                        <strong>功能不符：</strong>实际功能与宣传严重不符
                      </li>
                    </ul>
                  </section>

                  {/* 退款金额计算 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      2. 退款金额计算
                    </h2>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>
                        <strong>未使用期间：</strong>按未使用的天数比例退款
                      </li>
                      <li>
                        <strong>手续费：</strong>扣除第三方支付平台手续费
                      </li>
                      <li>
                        <strong>最低退款：</strong>单次退款金额不低于 ¥1.00
                      </li>
                    </ul>
                  </section>

                  {/* 退款流程 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      3. 退款流程
                    </h2>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>
                        <strong>提交申请：</strong>发送邮件至
                        mornscience@gmail.com 提交退款申请
                      </li>
                      <li>
                        <strong>审核处理：</strong>我们将在 1-3 个工作日内审核
                      </li>
                      <li>
                        <strong>退款确认：</strong>审核通过后发送退款确认邮件
                      </li>
                      <li>
                        <strong>资金退回：</strong>3-7 个工作日内原路退回
                      </li>
                    </ul>
                  </section>

                  {/* 申请材料 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      4. 申请材料
                    </h2>
                    <p className="text-gray-700">申请退款时，请提供：</p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>用户账户信息</li>
                      <li>订单号或交易流水号</li>
                      <li>退款原因说明</li>
                      <li>相关证据材料（如截图）</li>
                    </ul>
                  </section>

                  {/* 不退款情况 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      5. 不退款情况
                    </h2>
                    <p className="text-gray-700">以下情况不予退款：</p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>超过退款时限的申请</li>
                      <li>已充分使用服务功能</li>
                      <li>因用户个人原因导致的无法使用</li>
                      <li>违反服务条款被终止服务</li>
                      <li>恶意退款申请</li>
                    </ul>
                  </section>

                  {/* 退款方式 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      6. 退款方式
                    </h2>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>
                        <strong>原路退回：</strong>退款将原路返回到您的支付账户
                      </li>
                      <li>
                        <strong>到账时间：</strong>微信支付 1-3
                        个工作日，其他方式 3-7 个工作日
                      </li>
                    </ul>
                  </section>

                  {/* 争议处理 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      7. 争议处理
                    </h2>
                    <p className="text-gray-700">
                      如果您对退款处理结果有异议：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>可以申请重新审核</li>
                      <li>提供补充证据材料</li>
                      <li>通过客服渠道沟通解决</li>
                      <li>必要时可向相关监管部门投诉</li>
                    </ul>
                  </section>

                  {/* 政策更新 */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      8. 政策更新
                    </h2>
                    <p className="text-gray-700">
                      本退款政策可能会不时更新。重大变更将通过应用内通知告知用户。继续使用服务即表示您接受更新后的政策。
                    </p>
                  </section>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none space-y-6">
                  {/* Refundable Cases */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      Refundable Cases
                    </h2>
                    <p className="text-gray-700">
                      We offer refunds in the following scenarios (one-time
                      purchase):
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>Duplicate payments</li>
                      <li>
                        Inability to access or use the service for 7 consecutive
                        days post-purchase
                      </li>
                      <li>Major functional failures</li>
                      <li>Accidental purchase without using AI features</li>
                    </ul>
                  </section>

                  {/* Non-Refundable Cases */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      Non-Refundable Cases
                    </h2>
                    <p className="text-gray-700">
                      Refunds are not provided if:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>AI services have been used extensively</li>
                      <li>
                        Service issues are due to user network or device
                        problems
                      </li>
                      <li>Refund requests are submitted long after purchase</li>
                      <li>Account suspension due to violations</li>
                    </ul>
                  </section>

                  {/* Refund Procedure */}
                  <section>
                    <h2 className="text-2xl font-bold mt-6 mb-4">
                      Refund Procedure
                    </h2>
                    <p className="text-gray-700">
                      Email: <strong>mornscience@gmail.com</strong>
                    </p>
                    <p className="text-gray-700 mt-4">Provide:</p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>Account details</li>
                      <li>Payment proof</li>
                      <li>Refund reason</li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                      Review takes 1–3 business days. Refunds are returned via
                      original payment method within 3–7 business days.
                    </p>
                  </section>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
