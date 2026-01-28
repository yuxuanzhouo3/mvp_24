const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

// 后端基础地址：用于把 wx.login 的 code 发给后端换取 openid/token
// 没有后端时可保持为空字符串，此时前端只展示 code，不会发起网络请求。
const BASE_URL = ''

const request = ({
  url,
  method = 'GET',
  data,
  header,
  timeout = 10000,
} = {}) => {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('request: url is required'))
      return
    }

    wx.request({
      url,
      method,
      data,
      header,
      timeout,
      success: (res) => {
        const { statusCode, data: body } = res
        if (statusCode >= 200 && statusCode < 300) {
          resolve(body)
          return
        }
        const error = new Error(`request failed: ${statusCode}`)
        error.statusCode = statusCode
        error.body = body
        reject(error)
      },
      fail: reject,
    })
  })
}

module.exports = {
  formatTime,
  BASE_URL,
  request,
}
