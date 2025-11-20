身份认证
提示
新登录体系下，确保一个环境对应一个 tcb 实例（避免多次初始化相同环境的 tcb 实例）

App.auth()
接口描述
返回 Auth 对象

签名：auth(): Auth

危险
@cloudbase/js-sdk@2.x 版本将只支持 local 方式（Web 端在显式退出登录之前 30 天保留身份验证状态）存储身份状态。（原 1.x 版本的 session 及 none 模式不再支持）

示例代码
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({
  env: "xxxx-yyy",
  clientId: "xxxx",
});

const auth = app.auth();

注册/登录/登出相关
Auth.signUp
接口描述
接口功能：注册用户，目前支持手机号验证码注册，邮箱验证码注册。

接口声明：signUp(params: SignUpRequest): Promise<LoginState>

SignUpRequest
字段	类型	必填	说明
phone_number	string	否	注册所用手机号，phone_number 与 email 必须任选其一使用
email	string	否	注册所用邮箱 ，phone_number 与 email 必须任选其一使用
verification_code	string	否	验证码
verification_token	string	否	验证码 token
provider_token	string	否	第三方 provider token
password	string	否	密码
name	string	否	用户名
gender	string	否	性别
picture	string	否	头像
locale	string	否	地址
示例代码
Javascript
Bash
// 初始化SDK
const app = cloudbase.init({
  env: "xxxx-yyy",
  clientId: "xxxxx",
});

const auth = app.auth();

// 例：手机号验证码注册

// 1. 发送手机验证码
const phoneNumber = "+86 13800000000";
const verification = await auth.getVerification({
  phone_number: phoneNumber,
});

// 若使用邮箱验证，第一步代码改为
const email = "test@example.com";
const verification = await auth.getVerification({
  email: email,
});

// 2. 验证码验证
// 调用发送短信接口后，手机将会收到云开发的短信验证码。
// 用户填入短信验证码，可以调用下面的接口进行验证。

// 假设已收到用户填入的验证码"000000"
const verificationCode = "000000";
// 验证验证码的正确性
const verificationTokenRes = await auth.verify({
  verification_id: verification.verification_id,
  verification_code: verificationCode,
});

// 3. 注册
// 如果该用户已经存，则登录
if (verification.is_user) {
  await auth.signIn({
    username: phoneNumber,
    verification_token: verificationTokenRes.verification_token,
  });
} else {
  // 否则，则注册新用户，注册新用户时，可以设置密码，用户名
  // 备注：signUp 成功后，会自动登录
  await auth.signUp({
    phone_number: phoneNumber,
    verification_code: verificationCode,
    verification_token: verificationTokenRes.verification_token,
    // 可选，设置昵称
    name: "手机用户",
    // 可选，设置密码
    password: "password",
    // 可选，设置登录用户名
    username: "username",
  });
}

Auth.signIn
接口描述
接口功能：登录用户，目前支持手机号，邮箱，用户名密码登录。

接口声明：signIn(params: SignInRequest): Promise<LoginState>

SignInRequest
字段	类型	必填	说明
username	string	是	用户手机号，邮箱或自定义用户名
password	string	否	用户密码 ，password 与 verification_token 必须任选其一
verification_token	string	否	验证码 token ，password 与 verification_token 必须任选其一
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
  clientId: "xxxxx",
});

const auth = app.auth();

// 已完成注册
// 例：手机号登录
const phoneNumber = "+86 13800000000";

await auth.signIn({
  username: phoneNumber,
  password: "your password",
});

// 例：邮箱登录
const email = "test@example.com";

await auth.signIn({
  username: email,
  password: "your password",
});

// 例：用户名登录
const username = "myname";
await auth.signIn({
  username,
  password: "your password",
});

Auth.signOut()
接口描述
登出云开发

签名：signOut(): Promise<void>

示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

await auth.signOut();

Auth.signInAnonymously()
接口描述
匿名登录

接口声明 signInAnonymously(): Promise<LoginState>

示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();
await auth.signInAnonymously();

匿名登录转正示例

Javascript
const app = cloudbase.init({
  env: "xxxx-yyy"
})

const auth = app.auth()
// 1. 匿名登录
await auth.signInAnonymously()

// 2. 获取accesstoken
const access_token = await auth.getAccessToken()

// 3. 转正注册
await auth.signUp({
  ...// 传参参考 Auth.signUp接口
  anonymous_token: access_token
})

Auth.setCustomSignFunc()
接口描述
设置获取自定义登录 ticket 函数

接口声明 setCustomSignFunc(getTickFn: GetCustomSignTicketFn): void

GetCustomSignTicketFn
GetCustomSignTicketFn = () => Promise<string>

示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
});
const getTickFn = new Promise((resolve, reject));
const auth = app.auth();
await auth.setCustomSignFunc(getTickFn);

Auth.signInWithCustomTicket()
接口描述
自定义登录 接口声明 signInWithCustomTicket(): Promise<ILoginState>

示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();
await auth.signInWithCustomTicket();

Auth.signInWithOpenId()
接口描述
微信小程序 openId 静默登录

接口声明 signInWithOpenId(params: SignInWithOpenIdReq): Promise<LoginState>

SignInWithOpenIdReq
字段	类型	必填	默认值	说明
useWxCloud	boolean	否	true	true： 使用微信云开发模式进行请求，需开通小程序微信云开发环境； false：使用普通 http 请求
示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();
await auth.signInWithOpenId();

Auth.signInWithUnionId()
接口描述
微信小程序 unionId 静默登录

接口声明 signInWithUnionId(): Promise<LoginState>

示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();
await auth.signInWithUnionId();

Auth.signInWithPhoneAuth()
接口描述
微信小程序手机号授权登录

接口声明 signInWithPhoneAuth(params: SignInWithPhoneAuthReq): Promise<LoginState>

SignInWithPhoneAuthReq
字段	类型	必填	默认值	说明
phoneCode	string	是	空	微信小程序手机号授权码，通过微信小程序手机号快速验证组件
示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();
await auth.signInWithPhoneAuth({ phoneCode: "xxx" });

Auth.signInWithSms()
接口描述
短信验证码登陆

接口声明 signInWithSms(params: SignInWithSmsReq): Promise<LoginState>

SignInWithSmsReq
字段	类型	必填	默认值	说明
verificationInfo	object	验证码 token 信息	{}	Auth.getVerification()的返回值
verificationCode	string	验证码	空	获取到的短信验证码
phoneNum	string	手机号	空	获取验证码的手机号
示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

const verificationInfo = await auth.getVerification({
  phone_number: phoneNumber,
});
await auth.signInWithSms({
  verificationInfo,
  verificationCode: "xxx",
  phoneNum: "xxx",
});

Auth.signInWithEmail()
接口描述
邮箱验证码登陆

接口声明 signInWithEmail(params: SignInWithEmailReq): Promise<LoginState>

SignInWithEmailReq
字段	类型	必填	默认值	说明
verificationInfo	object	验证码 token 信息	{}	Auth.getVerification()的返回值
verificationCode	string	验证码	空	获取到的邮箱验证码
email	string	邮箱	空	获取验证码的邮箱地址
示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

const verificationInfo = await auth.getVerification({
  email: email,
});
await auth.signInWithEmail({
  verificationInfo,
  verificationCode: "xxx",
  email: "xxx",
});

Auth.toDefaultLoginPage()
接口描述
跳转系统默认登录页，兼容 web 和小程序端

接口声明 toDefaultLoginPage(params: authModels.ToDefaultLoginPage): Promise<void>

ToDefaultLoginPagelReq
字段	类型	含义	默认值	说明
config_version	string	默认登录页面的登录配置版本	env	1、‘env’表示托管登录页配置，可在“云开发平台-身份认证”中设置，2、非‘env’表示使用独立的托管登录页配置，可在“云开发平台-可视化低代码-访问控制”中设置，相应的 config_version 可以在应用自动跳转的__auth 登录页面的链接中参数获取到
redirect_uri	string	登录后重定向地址	默认为当前页面地址	
app_id	string	应用 id	空	config_version 不是‘env’的时候为必填项，如 app-xxx
示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

await auth.toDefaultLoginPage({
  config_version: "env",
  app_id: "app-xxx",
  redirect_uri: "xxx",
});

第三方平台登录相关
Auth.genProviderRedirectUri()
接口描述
生成第三方平台授权 Uri （如微信二维码扫码授权网页）

接口声明 genProviderRedirectUri(params: GenProviderRedirectUriRequest): Promise<GenProviderRedirectUriResponse>

GenProviderRedirectUriRequest
字段	类型	必填	说明
provider_id	string	是	第三方平台 ID，参考系统内置三方平台列表
provider_redirect_uri	string	是	第三方平台重定向 Uri，授权完成后，重定向时会在 url 中携带 code 参数
state	string	是	用户自定义状态标识字段，识别三方平台回调来源
other_params	{sign_out_uri?:string}	否	其他参数
GenProviderRedirectUriResponse
字段	类型	必填	说明
uri	string	是	客户端请求
signout_uri	string	是	登出 Uri
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();
const providerId = "test_provider_id";
const providerUri = "test_provider_redirect_uri";
const state = "wx_open";
const otherParams = { sign_out_uri: "test_sign_out_uri" };

// 三方平台授权登录示例

// 1. 获取第三方平台授权页地址（如微信授权）
const { uri } = await auth.genProviderRedirectUri({
  provider_id: providerId,
  provider_redirect_uri: providerUri,
  state: state,
  other_params: otherParams,
});

// 2. 访问uri （如 location.href = uri）

// 3. 授权 （如微信扫码授权）

// 4. 回调至 provider_redirect_uri 地址（url query中携带 授权code，state等参数），此时检查 state 是否符合预期（如 自己设置的 wx_open)
const provider_code = "your provider code";

// 5. state符合预期（微信开放平台授权 wx_open），则获取该三方平台token
const { provider_token } = await auth.grantProviderToken({
  provider_id: "wx_open",
  provider_redirect_uri: "cur page", // 指定三方平台跳回的 url 地址
  provider_code: provider_code, // 第三方平台跳转回页面时，url param 中携带的 code 参数
});

// 6. 通过 provider_token 登录
await auth.signInWithProvider({
  provider_token,
});

Auth.grantProviderToken()
接口描述
提供第三方平台登录 token

接口声明 grantProviderToken(params: GrantProviderTokenRequest): Promise<GrantProviderTokenResponse>

GrantProviderTokenRequest
字段	类型	必填	说明
provider_id	string	是	第三方平台 ID，参考系统内置三方列表
provider_redirect_uri	string	否	第三方平台重定向 uri
provider_code	string	否	第三方平台授权 code（重定向 uri 中携带）
provider_access_token	string	否	第三方平台访问 token（重定向 uri 中携带）
provider_id_token	string	否	第三方平台 ID token（重定向 uri 中携带）
GrantProviderTokenResponse
字段	类型	必填	说明
provider_token	string	是	第三方平台 token
expires_in	number	是	有效期
provider_profile	ProviderProfile	否	第三方身份源信息
ProviderProfile
字段	类型	必填	说明
provider_id	string	是	默认内置的三方 providerid，wx_open, wx_mp
sub	string	是	第三方用户 id (如 wxopenid)
name	string	否	名称
phone_number	string	否	手机号
picture	string	否	头像
meta	ProviderProfileMeta	否	第三方身份源扩展信息(小程序返回)
ProviderProfileMeta
字段	类型	必填	说明
appid	string	否	小程序的 appid
openid	string	否	小程序的 openid
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();
const providerId = "wx_open"; // 微信开放平台
auth.grantProviderToken({
  provider_id: providerId,
  provider_redirect_uri: "cur page", // 指定三方平台跳回的 url 地址
  provider_code: "provider code", // 第三方平台跳转回页面时，url param 中携带的 code 参数
});

Auth.signInWithProvider()
接口描述
第三方平台登录

接口声明 signInWithProvider(params: SignInWithProviderRequest): Promise<LoginState>

SignInWithProviderRequest
字段	类型	必填	说明
provider_token	string	是	第三方平台 token，参考 Auth.grantProviderToken
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();
const providerToken = "test_provider_token";
auth.signInWithProvider({
  provider_token: providerToken,
});

Auth.unbindProvider()
接口描述
解除第三方绑定

接口声明：unbindProvider(params: UnbindProviderRequest): Promise<void>

UnbindProviderRequest
字段	类型	必填	说明
provider_id	string	是	第三方平台 ID，参考第三方绑定时回包的
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

// 完成登录后

// 获取绑定第三方平台ID
const { id } = await auth.getProviders();

await auth.unbindProvider({
  provider_id: id,
});

Auth.getProviders()
接口描述
获取第三方绑定列表

接口声明：getProviders(): Promise<UserProfileProvider>

UserProfileProvider
字段	类型	必填	说明
id	string	是	第三方平台 ID
provider_user_id	string	是	第三方平台用户 ID
name	string	是	第三方平台昵称
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

// 完成登录后

await auth.getProviders();

Auth.bindWithProvider()
接口描述
绑定第三方登录

接口声明 bindWithProvider(params: BindWithProviderRequest): Promise<void>

BindWithProviderRequest
字段	类型	必填	说明
provider_token	string	是	第三方平台授权 token
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});
const provider_token = "test_provider_token"; // 参考Auth.grantProviderToken 获取

const auth = app.auth();
await auth.bindWithProvider({
  provider_token,
});

验证/授权相关
Auth.verify()
接口描述
验证码验证

接口声明 verify(params: VerifyRequest): Promise<VerifyResponse>

VerifyRequest
字段	类型	必填	说明
verification_code	string	是	验证码
verification_id	string	是	验证码 ID
VerifyResponse
字段	类型	必填	说明
verification_token	string	否	验证码 token
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

// 例：手机号验证码/ 邮箱验证码注册

// 1. 发送手机验证码
const phoneNumber = "+86 13800000000";
const verification = await auth.getVerification({
  phone_number: phoneNumber,
});

/*
// 若使用邮箱验证，第一步代码改为
const email = "test@example.com"
const verification = await auth.getVerification({
  email: email
});
*/
const verificationCode = "000000";

await auth.verify({
  verification_code: verificationCode,
  verification_id: verification.verification_id,
});

Auth.getVerification()
接口描述
获取短信/邮件验证码

接口声明 getVerification(params: GetVerificationRequest): Promise<GetVerificationResponse>

GetVerificationRequest
字段	类型	必填	说明
phone_number	string	否	手机号
email	string	否	邮箱
target	string|any	否	target
usage	string	否	usage
GetVerificationResponse
字段	类型	说明
verification_id	string	验证码 id
is_user	boolean	是否是注册用户
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

const verificationCode = "000000";
const email = "test@example.com";
const phoneNumber = "+86 13800000000";
const usage = "test_usage";

const verification = await auth.getVerification({
  phone_number: phoneNumber,
  // email: email,
});

Auth.sudo()
接口描述
通过 sudo 接口获取高级操作权限，如修改密码，修改手机号，修改邮箱等操作

接口声明 Auth.sudo(params: SudoRequest): Promise<{sudo_token?: string}>

SudoRequest
字段	类型	必填	说明
password	string	否	密码
verification_token	string	否	token 令牌，通过账号绑定的手机号或邮箱验证获取
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

// 方式一：使用密码
const pass = "test_password";
const sudoRes = await auth.sudo({
  password: pass,
});
console.log(sudoRes.sudo_token);

// 方式二：通过邮箱验证码，手机号验证码获取。
// 当前账号绑定的邮箱地址或手机号
const email = "test@example.com";
// const phoneNumber = "+86 13800000000"

// 获取验证码
const verification = await auth.getVerification({
  email: email,
  //  phone_number: phoneNumber
});

// 假设收到的验证码是 000000
const verificationCode = "000000";

// 验证验证码的正确性
const verificationTokenRes = await auth.verify({
  verification_id: verification.verification_id,
  verification_code: verificationCode,
});

// 获取 sudo_token
const sudoRes = await auth.sudo({
  verification_token: verificationTokenRes.verification_token,
});
console.log(sudoRes.sudo_token);

Auth.getAccessToken()
接口描述
获取访问凭证 accessToken

接口声明 Auth.getAccessToken(): Promise<{accessToken: string;env:string}>

示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

// 某种方式登录后...

// 获取access_token
const { accessToken } = await auth.getAccessToken();

console.log(accessToken);

用户信息相关
Auth.getCurrentUser()
接口描述
Auth.currentUser的异步操作，返回表示当前用户的 User 实例

签名：getCurrentUser(): Promise<User | null>

示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
  clientId: "xxxx",
});

// 执行某种登录之后...
app
  .auth()
  .getCurrentUser()
  .then((user) => {
    // ...
  });

Auth.bindPhoneNumber()
接口描述
绑定手机号

接口声明：bindPhone(params: BindPhoneRequest): Promise<void>

BindPhoneRequest
字段	类型	必填	说明
phone_number	string	是	新手机号
sudo_token	string	是	高级权限 token 令牌
verification_token	string	是	验证码 token 令牌
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

// 前置条件，先登录
const auth = app.auth();

// 第一步：获取 sudo token， 参考 Auth.sudo 接口获取
const sudo_token = "test_sudo_token";

// 第二步：给手机号发验证码
const phone_number = "+86 13800000000";

const verification = await auth.getVerification({
  phone_number: phone_number,
});

// 假设验证码是 000000
const verification_code = "000000";

// 第三步：验证验证码的正确性
const verification_token_res = await auth.verify({
  verification_id: verification.verification_id,
  verification_code: verification_code,
});
const verification_token = verification_token_res.verification_token;

// 第四步：绑定手机号
await auth.bindPhoneNumber({
  phone_number: phone_number,
  sudo_token: sudo_token,
  verification_token: verification_token,
});

Auth.bindEmail()
接口描述
更新邮箱地址

接口声明：bindEmail(params: BindEmailRequest): Promise<void>

BindEmailRequest
字段	类型	必填	说明
email	string	是	邮箱地址
sudo_token	string	是	token 令牌
verification_token	string	是	验证码 token
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

// 前置条件，先登录
const auth = app.auth();


// 第一步：获取 sudo token， 参考 Auth.sudo 接口获取
const sudoToken = "test_sudo_token"


// 第二步：验证新邮箱地址
const newEmail = "new@example.com";
const verification = await auth.getVerification({
  email: newEmail
});

// 假设用户输入的验证码为 000000
const verificationCode = "000001";

// 检查验证码的正确性
const newEmailTokenRes = await auth.verify({
  verification_id: verification.verification_id,
  verification_code: verificationCode,
});
const verificationToken = newEmailTokenRes.verification_token


// 第三步：绑定新邮箱
await auth.bindEmail({
  email: newEmail,
  sudo_token: sudoToken
  verification_token: verificationToken
});

Auth.setPassword()
接口描述
设置密码（已登录状态下，更新用户密码）

接口声明 setPassword(params: SetPasswordRequest): Promise<void>

SetPasswordRequest
字段	类型	必填	说明
new_password	string	是	新密码
sudo_token	string	是	token 令牌 (如果用户只开启三方登录， 没有设置密码的情况下，sudo token 为 "" 空字符串)
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

// 第一步：获取 sudo token，参考 Auth.sudo 接口获取
const sudoToken = "test_sudo_token";

// 第二步：更新密码
const newPassWord = "test_new_password";
await auth.setPassword({
  new_password: newPassWord,
  sudo_token: sudoToken,
});

Auth.getUserInfo()
接口描述
获取用户信息失败 接口声明 getUserInfo(): Promise<UserInfo>

UserInfo
字段	类型	说明
User.name	string	用户昵称（区分与 登录用户名 User.username）
User.picture	string	用户上传头像
User.phone_number	string	用户绑定手机号
User.email_verified	boolean	用户是否经过邮箱验证
User.birthdate	string	用户生日
User.locale	string	用户设置语言
User.zoneinfo	string	时区
User.UserProfileProvider	UserProfileProvider	第三方平台配置
UserProfileProvider
字段	类型	必填	说明
id	string	否	默认内置的三方 providerid，wx_open, wx_mp
provider_user_id	string	否	第三方 provider 用户 id (如 wxopenid)
name	string	否	名称
系统内置三方列表
provider_id	含义
wx_open	微信开放平台
wx_mp	微信公众号
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});
const newPassWord = "test_new_password";
const sudoToken = "test_sudo_token";

const auth = app.auth();
const userInfo = await auth.getUserInfo();

Auth.queryUser()
危险
自定义登录场景和匿名登录场景，不支持使用该接口查询用户信息（自定义登录场景请在业务服务中自行查询用户信息，匿名登录场景不支持）

接口描述
查询用户

接口声明 queryUser(queryObj: QueryUserProfileRequest): Promise<QueryUserProfileResponse>;

QueryUserProfileRequest
字段	类型	必填	说明
id	Array<string>	否	用户 uid 数组，最多支持查询 50 个 id 对应的用户
username	string	否	用户名称
email	string	否	邮箱
phone_number	string	否	手机号
QueryUserProfileResponse
字段	类型	必填	说明
total	string	否	数量
data	SimpleUserProfile[]	否	用户列表
SimpleUserProfile
字段	类型	必填	说明
sub	string	是	下标
name	string	是	名称
picture	string	否	图片
gender	string	否	性别
locale	string	否	地点
email	string	否	邮箱
phone_number	string	否	手机号
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();
const email = "test@example.com";
const phoneNumber = "+86 13800000000";
const username = "test_username";

const userInfo = await auth.queryUser({
  username: username,
});

Auth.resetPassword()
接口描述
重置密码（用户忘记密码无法登录时，可使用该接口强制设置密码） 接口声明 resetPassword(params: ResetPasswordRequest): Promise<void>

ResetPasswordRequest
字段	类型	必填	说明
email	string	是	邮箱
phone_number	string	是	手机号
new_password	string	是	新密码
verification_token	string	是	验证 token
示例代码
Javascript
Bash
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();
const email = "testexample.com";
const newPassword = "test_new_password";
const phoneNumber = "+86 13800000000";
const verification = await auth.getVerification({
  phone_number: phoneNumber,
});
const verificationCode = "000000";
// 验证验证码的正确性
const verificationToken = await auth.verify({
  verification_id: verification.verification_id,
  verification_code: verificationCode,
});

await auth.resetPassword({
  // email: email,
  phone_number: phoneNumber,
  new_password: newPassword,
  verification_token: verificationToken.verificationToken,
});

Auth.isUsernameRegistered()
接口描述
检查用户名是否被绑定过。

签名：isUsernameRegistered(username: string): Promise<boolean>

示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

const username = "your_awesome_username";
auth.isUsernameRegistered(username).then((registered) => {
  //
});

Auth.deleteMe()
接口描述
删除用户。

签名：deleteMe(params: WithSudoRequest): Promise<{name?: string; picture?: string; expires_at?: string;}>

示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

// 1. 通过 sudo 操作获取 sudo_token，参考 Auth.sudo 方法

// 2. deleteMe

const user = await auth.deleteMe({
  sudo_token: "your sudo_token",
});

Auth.loginScope()
接口描述
查询用户是否为匿名登录状态

签名：loginScope(): Promise<string>

示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
});

const auth = app.auth();

const username = "your_awesome_username";

// 经过某种方式登录后...

const loginScope = await auth.loginScope();
if (loginScope === "anonymous") {
  console.log("当前为匿名登录方式");
}

LoginState
LoginState 对象是对用户当前的登录态的抽象

Auth.hasLoginState()
接口描述
返回当前登录状态 LoginState，如果未登录，则返回 null

签名：hasLoginState(): LoginState | null

示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
  clientId: "xxxx",
});

const loginState = app.auth().hasLoginState();

if (loginState) {
  // 登录态有效
} else {
  // 没有登录态，或者登录态已经失效
}

Auth.getLoginState()
接口描述
Auth.hasLoginState()的异步操作，返回当前登录状态 LoginState，如果未登录，则返回 null

签名：getLoginState(): Promise<LoginState | null>

提示
此 API 是 hasLoginState 的异步模式，适用于本地存储为异步的平台，比如 React Native

示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
  clientId: "xxxx",
});

const loginState = app
  .auth()
  .getLoginState()
  .then((loginState) => {
    if (loginState) {
      // 登录态有效
    } else {
      // 没有登录态，或者登录态已经失效
    }
  });

Auth.onLoginStateChanged()
接口描述
监听登录状态变化，当登录状态发生变化时会触发该函数。比如调用注册/登录/登出相关接口、或者 Credentials 出现异常(如'credentials not found'、'no refresh token found in credentials'错误)等。

接口声明 onLoginStateChanged(callback: Function): Promise<void>

OnLoginStateChangedParams
字段	类型	必填	说明
callback	Function	是	回调函数
callback 回调函数入参定义
字段	类型	说明
name	string	默认值为 loginStateChanged
data	object	包括 { msg?: string; eventType: 'sign_in' | 'sign_out' | 'credentials_error' }
提示
如果 eventType 是 sign_in 或 sign_out，还会返回当前登录状态 LoginState

示例代码
const app = cloudbase.init({
  env: "xxxx-yyy",
  clientId: "xxxx",
});

app.auth().onLoginStateChanged((params) => {
  console.log(params);
  const { eventType } = params?.data || {};
  switch (eventType) {
    case "sign_in":
      // 登录成功
      break;
    case "sign_out":
      // 退出登录成功
      break;
    case "credentials_error":
      // 权限失效
      break;
    default:
      return;
  }
});

LoginState.user
类型：User | null

表示当前用户，具体请参考 User

如果没有登录，则为 null

User
User.update()
接口描述
更新用户信息

签名：update(userInfo): Promise<void>

示例代码
const user = auth.currentUser;

user
  .update({
    gender: "MALE", // 性别，取值仅限于 MALE、FEMALE、UNKNOWN
  })
  .then(() => {
    // 更新用户信息成功
  });

User.refresh()
接口描述
刷新本地用户信息。当用户在其他客户端更新用户信息之后，可以调用此接口同步更新之后的信息。

签名：refresh(): Promise<UserInfo>

示例代码
const user = auth.currentUser;

user.refresh().then(() => {
  // 刷新用户信息成功
});

错误码
登录错误
错误码	说明
not_found	用户不存在
password_not_set	当前用户未设置密码，请使用验证码登录或第三方登录方式
invalid_password	密码不正确
user_pending	该用户未激活
user_blocked	该用户被停用
invalid_status	您已经超过了密码最大重试次数， 请稍后重试
invalid_two_factor	二次验证码不匹配或已过时
注册错误
错误码	说明
failed_precondition	你输入的手机号或邮箱已被注册，请使用其他号码
验证码相关错误
错误码	说明
failed_precondition	从第三方获取用户信息失败
resource_exhausted	你尝试过于频繁，请稍后重试
invalid_argument	您输入的验证码不正确或已过期
aborted	你尝试的次数过多，请返回首页，稍后重试
permission_denied	您当前的会话已过期，请返回重试
captcha_required	需要输入验证码, 需根据反机器人服务接入
captcha_invalid	验证码不正确, 需根据反机器人服务接入
其他错误
错误码	说明
unreachable	网络错误，请检查您的网络连接，稍后重试
错误描述
错误码	错误描述	说明
permission_denied	cors permission denied,please check if {url} in your client {env} domains	请在“云开发平台-环境配置-安全来源-安全域名”中检查对应{env}环境下是否已经配置了安全域名{url}，配置后 10 分钟生效
验证码相关处理
error==captcha_required 或 error==captcha_invalid 表示请求触发了验证码相关逻辑。需要进行机器验证。

验证码流程完成后，若业务接口返回 error 等于 captcha_required，表示请求需要 captcha_token 参数，尽可能使用本地的未过期的验证码。当 error 等于 captcha_invalid 时，表示验证码无效，需要需要重新获取验证码。在同一个验证流程内，captcha_invalid 最多尝试一次即可。

如需使用 adapter 进行处理，请参考adapter 的验证码处理指南

初始化验证码
curl -X POST "https://${env}.ap-shanghai.tcb-api.tencentcloudapi.com/auth/v1/captcha/init" \
   -H "Content-Type:application/json" \
   -u ${clientID}:${clientSecrect}
   -d \
'{
  "redirect_uri": "https://example.com/callback",
  "state": "your_state string"
}'

请求参数
redirect_uri: (必传) 验证码验证完成后的地址。 state: (必传) 系统状态字符串，该字符串在验证码验证完成后后将 state 携带到。

响应 1：状态码 200 且返回 url 字段非空，需要展示验证码并完成验证
如果用户请求比较频繁或存在其他风险，验证码服务会返回下面的形式。

{
  "url": "https://exmaple.com/captcha.html",
  "expires_in": 600
}

此时表示，用户行为需要经过验证码验证才可以通过，请求成功后，客户端通过浏览器或 webview/iframe 等 打开 url 地址，比如上面的https://exmaple.com/captcha.html 用户在 web 中处理完成后，会自动重定向到下面的地址：（其中 captcha_token 为验证码 token，expires_in 为过期时间，单位为秒）， https://example.com/callback?state=xxxxx&captcha_token=hbGciOiJeyJhbGciOiJSUAeyJhbGciOiJ&expires_in=600

业务方需要监听 redirect_uri 的地址变化，当地址为 appanme://com.package.name/callback 时，比对 state 是否和传入的相同，并获取到 captcha_token 和 expires_in。

若验证过程发生错误，验证页面会展示错误信息，用户点击返回后，验证页面会将错误信息 error 和 error_description 拼接到 redirect_uri 后重定向，例如：

https://example.com/callback?state=xxxxx&error=xxx&error_description=xxx

此时业务方可以根据需要恢复初始页或做其它处理。

响应 2：状态码非 200，需要进行错误处理
如果用户请求比较频繁或存在其他风险，验证码服务会返回下面的形式。

{
  "error": "resource_exhausted",
  "error_description": "Your operation is too frequent, please try again later"
}

此时客户端需要展示 error_descriprion, 可以结合 i18n 展示进行多语言展示。

拿到 captcha_token 再次请求
拿到 captcha_token 后，将 captcha_token 放到 url 参数中进行请求；

比如，请求 /v1/example 返回 captcha_invalid 错误，此时，则需要再次请求 /v1/example?captcha_token=hbGciOiJeyJhbGciOiJSUAeyJhbGciOiJ 即可完成操作。

