import { NextRequest, NextResponse } from 'next/server';
import { downloadFileFromCloudBase } from '@/lib/cloudbase-service';
import { getDownloadUrl } from '@/lib/config/download.config';

export const runtime = 'nodejs';

/**
 * 下载文件 API 端点
 *
 * 国内版（CN）: 通过 CloudBase SDK 下载文件
 * 国际版（INTL）: 直接重定向到 GitHub Releases
 *
 * 请求示例:
 * GET /api/downloads?platform=android&region=CN
 * GET /api/downloads?platform=macos&arch=intel&region=CN
 * GET /api/downloads?platform=macos&arch=apple-silicon&region=INTL
 *
 * 响应示例（成功）:
 * {
 *   "success": true,
 *   "platform": "android",
 *   "region": "CN",
 *   "fileName": "multigpt-android-cn.apk",
 *   "downloadUrl": "data:application/octet-stream;base64,..."
 * }
 *
 * 响应示例（国际版）:
 * {
 *   "success": true,
 *   "platform": "macos",
 *   "arch": "apple-silicon",
 *   "region": "INTL",
 *   "downloadUrl": "https://github.com/..."
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const arch = searchParams.get('arch') as 'intel' | 'apple-silicon' | null;
    const region = searchParams.get('region') || 'CN';

    console.log('[Download API] 请求参数 - platform:', platform, 'arch:', arch, 'region:', region);

    // 参数验证
    if (!platform) {
      return NextResponse.json(
        { error: '缺少必需参数: platform (android|ios|windows|macos)' },
        { status: 400 }
      );
    }

    const validPlatforms = ['android', 'ios', 'windows', 'macos'];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json(
        { error: `无效的平台: ${platform}. 支持的平台: ${validPlatforms.join(', ')}` },
        { status: 400 }
      );
    }

    // 国内版处理 - 使用 CloudBase fileID
    if (region === 'CN') {
      return handleChinaDownload(platform, arch);
    }

    // 国际版处理 - 重定向到 GitHub
    return handleIntlDownload(platform, arch);
  } catch (error) {
    console.error('[Download API] 错误:', error);
    return NextResponse.json(
      { error: '下载请求失败，请稍后重试' },
      { status: 500 }
    );
  }
}

/**
 * 处理国内版下载 - 从 CloudBase 读取文件
 */
async function handleChinaDownload(
  platform: string,
  arch?: 'intel' | 'apple-silicon' | null
): Promise<NextResponse> {
  // 从环境变量读取 fileID（仅后端可访问）
  const fileIdMap: Record<string, Record<string, { fileID: string; fileName: string }>> = {
    android: {
      default: {
        fileID: process.env.CN_ANDROID_FILE_ID || 'cloud://your-bucket/downloads/multigpt-android-cn.apk',
        fileName: 'multigpt-android-cn.apk',
      },
    },
    ios: {
      default: {
        fileID: process.env.CN_IOS_FILE_ID || 'cloud://your-bucket/downloads/multigpt-ios-cn.ipa',
        fileName: 'multigpt-ios-cn.ipa',
      },
    },
    windows: {
      default: {
        fileID: process.env.CN_WINDOWS_FILE_ID || 'cloud://your-bucket/downloads/multigpt-windows-cn.exe',
        fileName: 'multigpt-windows-cn.exe',
      },
    },
    macos: {
      intel: {
        fileID: process.env.CN_MACOS_INTEL_FILE_ID || 'cloud://your-bucket/downloads/multigpt-macos-intel-cn.dmg',
        fileName: 'multigpt-macos-intel-cn.dmg',
      },
      'apple-silicon': {
        fileID: process.env.CN_MACOS_APPLE_SILICON_FILE_ID || 'cloud://your-bucket/downloads/multigpt-macos-apple-silicon-cn.dmg',
        fileName: 'multigpt-macos-apple-silicon-cn.dmg',
      },
    },
  };

  const platformMap = fileIdMap[platform];
  if (!platformMap) {
    return NextResponse.json(
      { error: `不支持的平台: ${platform}` },
      { status: 400 }
    );
  }

  // 对于 macOS，必须指定架构；其他平台使用 default
  const archKey = platform === 'macos' && arch ? arch : 'default';
  const fileInfo = platformMap[archKey];

  if (!fileInfo) {
    return NextResponse.json(
      { error: `不支持的平台或架构组合: ${platform}${arch ? ' (' + arch + ')' : ''}` },
      { status: 400 }
    );
  }

  console.log('[Download API] 从 CloudBase 下载 fileID:', fileInfo.fileID);

  try {
    // 调用 CloudBase SDK 下载文件
    const fileContent = await downloadFileFromCloudBase(fileInfo.fileID);

    console.log('[Download API] 文件下载成功，大小:', fileContent.length, 'bytes');

    // 方案 1: 返回 Base64 编码的文件内容（适合小文件）
    // 前端可以通过创建临时链接下载
    const base64Content = fileContent.toString('base64');
    const dataUrl = `data:application/octet-stream;base64,${base64Content}`;

    return NextResponse.json({
      success: true,
      platform,
      arch: arch || undefined,
      region: 'CN',
      fileName: fileInfo.fileName,
      downloadUrl: dataUrl,
      fileSize: fileContent.length,
    });

    // 方案 2: 直接返回文件二进制（更高效的大文件处理）
    // return new NextResponse(fileContent, {
    //   headers: {
    //     'Content-Type': 'application/octet-stream',
    //     'Content-Disposition': `attachment; filename="${fileInfo.fileName}"`,
    //     'Content-Length': fileContent.length.toString(),
    //   },
    // });
  } catch (error: any) {
    const errorMessage = error.message || error.toString();
    console.error('[Download API] CloudBase 下载异常:', errorMessage);

    // 根据错误类型返回适当的 HTTP 状态码和错误信息
    if (errorMessage.includes('不存在') || errorMessage.includes('not found')) {
      return NextResponse.json(
        { error: `文件不存在（fileID: ${fileInfo.fileID}），请检查 fileID 配置是否正确` },
        { status: 404 }
      );
    } else if (errorMessage.includes('无权限') || errorMessage.includes('permission')) {
      return NextResponse.json(
        { error: '无权限访问该文件，请检查 CloudBase 配置和权限设置' },
        { status: 403 }
      );
    } else if (errorMessage.includes('初始化失败')) {
      return NextResponse.json(
        { error: '服务器配置错误：CloudBase 初始化失败，请检查环境变量配置（NEXT_PUBLIC_WECHAT_CLOUDBASE_ID, CLOUDBASE_SECRET_ID, CLOUDBASE_SECRET_KEY）' },
        { status: 500 }
      );
    } else if (errorMessage.includes('超时')) {
      return NextResponse.json(
        { error: '文件下载超时，请稍后重试' },
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

/**
 * 处理国际版下载 - 重定向到配置的 URL
 */
function handleIntlDownload(platform: string): NextResponse {
  // 从配置文件读取国际版 URL
  const downloadUrl = getDownloadUrl(platform as any, false);

  if (!downloadUrl) {
    return NextResponse.json(
      { error: `不支持的平台或未配置下载链接: ${platform}` },
      { status: 400 }
    );
  }

  console.log('[Download API] 重定向到国际版 URL:', downloadUrl);

  // HTTP 302 重定向到配置的下载链接
  return NextResponse.redirect(downloadUrl, { status: 302 });
}
