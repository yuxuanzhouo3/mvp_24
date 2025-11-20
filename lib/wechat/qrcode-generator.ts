/**
 * 微信二维码生成
 * 使用简单的字符编码方式将登录URL转换为二维码
 */

/**
 * 简单的 QR Code 生成器
 * 注：这是一个简化版本，实际应用可考虑使用 qrcode 库
 *
 * @param text 要编码的文本（通常是登录URL）
 * @returns 返回 Google Charts QR Code API URL
 */
export function generateQRCodeUrl(text: string): string {
  // 使用 Google Charts API 生成二维码
  // 这是免费的，无需安装额外库
  const encodedText = encodeURIComponent(text);
  return `https://chart.googleapis.com/chart?chs=300x300&chld=M|0&cht=qr&chl=${encodedText}`;
}

/**
 * 另一个选择：使用 QR Server API（更稳定）
 * @param text 要编码的文本
 * @returns QR Code 图片 URL
 */
export function generateQRCodeUrlV2(text: string): string {
  const encodedText = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedText}`;
}

/**
 * 验证 URL 是否有效
 * @param url 微信登录 URL
 * @returns 是否有效
 */
export function isValidWechatLoginUrl(url: string): boolean {
  return (
    url.includes("open.weixin.qq.com") &&
    url.includes("appid=") &&
    url.includes("redirect_uri=") &&
    url.includes("response_type=code")
  );
}
