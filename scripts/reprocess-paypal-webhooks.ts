import { supabaseAdmin } from "../lib/supabase-admin";
import { WebhookHandler } from "../lib/payment/webhook-handler";

async function reprocessPaypalWebhooks() {
  console.log("🔄 重新处理PayPal webhook事件...");

  const handler = WebhookHandler.getInstance();

  try {
    // 查询所有未处理的PayPal webhook事件
    const { data: unprocessedEvents, error } = await supabaseAdmin
      .from("webhook_events")
      .select("*")
      .eq("provider", "paypal")
      .eq("processed", false)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("❌ 查询未处理事件出错:", error);
      return;
    }

    console.log(
      `📋 找到 ${unprocessedEvents.length} 个未处理的PayPal webhook事件`
    );

    for (const event of unprocessedEvents) {
      console.log(`\n🔄 处理事件: ${event.event_type} (ID: ${event.id})`);

      try {
        const success = await handler.processWebhook(
          event.provider,
          event.event_type,
          event.event_data
        );

        if (success) {
          console.log(`✅ 事件处理成功: ${event.event_type}`);
        } else {
          console.log(`❌ 事件处理失败: ${event.event_type}`);
        }
      } catch (processError) {
        console.error(`❌ 处理事件时出错: ${event.event_type}`, processError);
      }
    }

    console.log("\n🎉 PayPal webhook重新处理完成!");
  } catch (error) {
    console.error("❌ 重新处理过程中出错:", error);
  }
}

reprocessPaypalWebhooks().catch(console.error);
