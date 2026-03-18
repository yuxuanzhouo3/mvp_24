interface Jscode2SessionResponse {
  statusCode: number
  data: {
    openid?: string
    session_key?: string
    unionid?: string
    errcode?: number
    errmsg?: string
  }
}

export async function wechatJscode2Session({
  appid,
  secret,
  code
}: {
  appid: string
  secret: string
  code: string
}): Promise<Jscode2SessionResponse> {
  const qs = new URLSearchParams({
    appid,
    secret,
    js_code: code,
    grant_type: 'authorization_code',
  }).toString()

  const url = `https://api.weixin.qq.com/sns/jscode2session?${qs}`

  const response = await fetch(url)
  const data = await response.json()

  return {
    statusCode: response.status,
    data
  }
}
