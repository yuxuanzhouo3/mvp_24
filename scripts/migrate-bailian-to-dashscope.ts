#!/usr/bin/env tsx
/**
 * 迁移脚本：将数据库中 provider: "bailian" 的记录更新为 provider: "dashscope"
 */

import { getDatabase } from "../lib/cloudbase-service";

const COLLECTION = "ai_model_catalog";

async function migrate() {
  const db = getDatabase();

  console.log("开始迁移 provider: bailian -> dashscope...");

  const result = await db.collection(COLLECTION).where({ provider: "bailian" }).get();
  const records = Array.isArray(result?.data) ? result.data : [];

  console.log(`找到 ${records.length} 条需要更新的记录`);

  for (const record of records) {
    await db.collection(COLLECTION).doc(record._id).update({
      provider: "dashscope",
      updated_at: new Date().toISOString(),
    });
    console.log(`✓ 已更新: ${record.model_key}`);
  }

  console.log("迁移完成！");
}

migrate().catch(console.error);
