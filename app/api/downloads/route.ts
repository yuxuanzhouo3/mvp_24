import { NextRequest, NextResponse } from "next/server";
import { downloadFileFromCloudBase } from "@/lib/cloudbase-service";
import {
  getActiveRelease,
  type Platform,
  type Variant,
} from "@/actions/admin-releases";

async function handleRegionDownload(
  platform: Platform,
  variant: Variant | null,
  region: "CN" | "INTL",
  arch?: string | null
): Promise<NextResponse> {
  const release = await getActiveRelease(platform, variant);

  if (!release) {
    return NextResponse.json(
      {
        error: `未配置 ${region} 版本的下载信息: ${platform}${
          arch ? ` (${arch})` : ""
        }`,
      },
      { status: 400 }
    );
  }

  // CN：使用 CloudBase，INTL：使用 Supabase
  if (region === "CN") {
    if (!release.cloudbase_file_id) {
      return NextResponse.json(
        { error: `国内版未配置 CloudBase fileID: ${platform}` },
        { status: 400 }
      );
    }
    return handleCloudBaseDownload(release);
  } else {
    if (!release.file_url) {
      return NextResponse.json(
        { error: `国际版未配置下载链接: ${platform}` },
        { status: 400 }
      );
    }
    return handleSupabaseDownload(release);
  }
}

async function handleCloudBaseDownload(release: any): Promise<NextResponse> {
  const fileName =
    release.download_filename ||
    getFileNameFromCloudID(release.cloudbase_file_id) ||
    "download.bin";

  try {
    const fileContent = await downloadFileFromCloudBase(release.cloudbase_file_id);

    console.log(
      `[Download API] CloudBase 国内版文件下载成功，大小:`,
      fileContent.length,
      "bytes"
    );

    const uint8Array = new Uint8Array(fileContent);
    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": uint8Array.length.toString(),
        "Cache-Control": "public, max-age=604800",
      },
    });
  } catch (error: any) {
    const errorMessage = error.message || error.toString();
    console.error("[Download API] CloudBase 下载异常:", errorMessage);

    if (errorMessage.includes("不存在") || errorMessage.includes("not found")) {
      return NextResponse.json(
        {
          error: `文件不存在（fileID: ${release.cloudbase_file_id}），请检查配置是否正确`,
        },
        { status: 404 }
      );
    } else if (
      errorMessage.includes("无权限") ||
      errorMessage.includes("permission")
    ) {
      return NextResponse.json(
        { error: "无权限访问该文件，请检查 CloudBase 配置或 IAM 权限" },
        { status: 403 }
      );
    } else if (errorMessage.includes("初始化失败")) {
      return NextResponse.json(
        {
          error:
            "服务器配置错误：CloudBase 初始化失败，请检查 NEXT_PUBLIC_WECHAT_CLOUDBASE_ID 和密钥是否正确",
        },
        { status: 500 }
      );
    } else if (errorMessage.includes("超时")) {
      return NextResponse.json(
        { error: "文件下载超时，请稍后重试" },
        { status: 504 }
      );
    } else {
      return NextResponse.json(
        { error: `文件下载失败: ${errorMessage}` },
        { status: 500 }
      );
    }
  }
}

function handleSupabaseDownload(release: any): NextResponse {
  // 国际版直接重定向到 Supabase 公开 URL
  console.log(
    `[Download API] Supabase 国际版重定向:`,
    release.file_url
  );
  return NextResponse.redirect(release.file_url, { status: 302 });
}
const SUPPORTED_PLATFORMS: Platform[] = ["android", "ios", "windows", "macos", "linux"];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const platformParam = url.searchParams.get("platform");
  const regionParam = url.searchParams.get("region");
  const archParam = url.searchParams.get("arch");

  if (!platformParam) {
    return NextResponse.json(
      { error: "缺少 platform 参数" },
      { status: 400 }
    );
  }

  if (!SUPPORTED_PLATFORMS.includes(platformParam as Platform)) {
    return NextResponse.json(
      { error: "不支持的 platform 参数" },
      { status: 400 }
    );
  }

  const region = regionParam === "CN" ? "CN" : "INTL";
  const platform = platformParam as Platform;
  const variant =
    platform === "macos" && archParam === "apple-silicon" ? "apple-silicon" : null;

  return handleRegionDownload(platform, variant, region, archParam);
}

function getFileNameFromCloudID(fileID: string): string | undefined {
  const parts = fileID.split("/");
  return parts[parts.length - 1] || undefined;
}
