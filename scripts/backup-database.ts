// scripts/backup-database.ts - 数据库备份脚本
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

/**
 * 数据库备份脚本
 * 使用Supabase CLI进行数据库备份
 */
async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(process.cwd(), "backups");

  // 确保备份目录存在
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFileName = `backup-${timestamp}.sql`;
  const backupPath = path.join(backupDir, backupFileName);

  try {
    console.log("Starting database backup...");

    // 检查Supabase CLI是否安装
    await execAsync("supabase --version");

    // 执行数据库备份
    const { stdout, stderr } = await execAsync(
      `supabase db dump --db-url "${process.env.DATABASE_URL}" > "${backupPath}"`
    );

    if (stderr) {
      console.warn("Backup stderr:", stderr);
    }

    console.log(`Database backup completed: ${backupPath}`);

    // 清理旧备份（保留最近7天的备份）
    await cleanupOldBackups(backupDir);

    return { success: true, path: backupPath };
  } catch (error) {
    console.error("Database backup failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 清理旧备份文件
 */
async function cleanupOldBackups(backupDir: string) {
  try {
    const files = fs
      .readdirSync(backupDir)
      .filter((file) => file.startsWith("backup-") && file.endsWith(".sql"))
      .map((file) => ({
        name: file,
        path: path.join(backupDir, file),
        stats: fs.statSync(path.join(backupDir, file)),
      }))
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

    // 保留最近7天的备份
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const filesToDelete = files.filter(
      (file) => file.stats.mtime < sevenDaysAgo
    );

    for (const file of filesToDelete) {
      fs.unlinkSync(file.path);
      console.log(`Deleted old backup: ${file.name}`);
    }
  } catch (error) {
    console.error("Error cleaning up old backups:", error);
  }
}

/**
 * 上传备份到云存储（可选）
 */
async function uploadBackupToCloud(backupPath: string) {
  // 这里可以添加上传到AWS S3、Google Cloud Storage等云存储的逻辑
  // 暂时只记录日志
  console.log(`Backup ready for cloud upload: ${backupPath}`);
}

// 如果直接运行此脚本
if (require.main === module) {
  backupDatabase()
    .then((result) => {
      if (result.success) {
        console.log("Backup completed successfully");
        process.exit(0);
      } else {
        console.error("Backup failed:", result.error);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("Unexpected error:", error);
      process.exit(1);
    });
}

export { backupDatabase };
