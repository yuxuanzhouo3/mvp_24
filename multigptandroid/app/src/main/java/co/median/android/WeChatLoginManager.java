package co.median.android;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.text.TextUtils;
import android.util.Log;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.tencent.mm.opensdk.modelmsg.SendAuth;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;

import java.util.UUID;

/**
 * Lightweight WeChat login helper that bridges SDK callbacks back to the WebView.
 */
public class WeChatLoginManager {
    public static final String ACTION_WECHAT_LOGIN_RESULT = "co.median.android.action.WECHAT_LOGIN_RESULT";
    public static final String EXTRA_ERR_CODE = "errCode";
    public static final String EXTRA_ERR_STR = "errStr";
    public static final String EXTRA_CODE = "code";
    public static final String EXTRA_STATE = "state";

    private static final String TAG = "WeChatLogin";

    private final Context appContext;
    private final IWXAPI wxApi;
    private String pendingCallback;
    private String pendingState;
    private WeChatLoginListener listener;

    public WeChatLoginManager(Context context) {
        this.appContext = context.getApplicationContext();
        this.wxApi = WXAPIFactory.createWXAPI(appContext, BuildConfig.WECHAT_APP_ID, false);
        if (!TextUtils.isEmpty(BuildConfig.WECHAT_APP_ID)) {
            this.wxApi.registerApp(BuildConfig.WECHAT_APP_ID);
        }
        Log.d(TAG, "init wxApi appId=" + BuildConfig.WECHAT_APP_ID + " installed=" + wxApi.isWXAppInstalled());
        LocalBroadcastManager.getInstance(appContext).registerReceiver(resultReceiver,
                new IntentFilter(ACTION_WECHAT_LOGIN_RESULT));
    }

    public void setListener(@Nullable WeChatLoginListener listener) {
        this.listener = listener;
    }

    public boolean startLogin(@Nullable String callback) {
        if (TextUtils.isEmpty(BuildConfig.WECHAT_APP_ID)) {
            Toast.makeText(appContext, "微信AppId未配置", Toast.LENGTH_SHORT).show();
            Log.w(TAG, "startLogin failed: empty appId");
            return false;
        }
        if (!wxApi.isWXAppInstalled()) {
            Toast.makeText(appContext, "未安装微信", Toast.LENGTH_SHORT).show();
            Log.w(TAG, "startLogin failed: WeChat not installed");
            return false;
        }

        SendAuth.Req req = new SendAuth.Req();
        req.scope = "snsapi_userinfo";
        this.pendingState = UUID.randomUUID().toString();
        req.state = this.pendingState;
        this.pendingCallback = callback;

        boolean sent = wxApi.sendReq(req);
        Log.d(TAG, "sendReq result=" + sent + " state=" + this.pendingState + " appId=" + BuildConfig.WECHAT_APP_ID);
        if (!sent) {
            Toast.makeText(appContext, "微信登录请求发送失败", Toast.LENGTH_SHORT).show();
        }
        return sent;
    }

    public void unregister() {
        LocalBroadcastManager.getInstance(appContext).unregisterReceiver(resultReceiver);
    }

    private final BroadcastReceiver resultReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (listener == null) return;

            int errCode = intent.getIntExtra(EXTRA_ERR_CODE, Integer.MIN_VALUE);
            String errStr = intent.getStringExtra(EXTRA_ERR_STR);
            String code = intent.getStringExtra(EXTRA_CODE);
            String state = intent.getStringExtra(EXTRA_STATE);

            // Validate state to avoid replay from stale responses.
            if (pendingState != null && state != null && !pendingState.equals(state)) {
                return;
            }

            WeChatLoginResult result = new WeChatLoginResult(errCode, errStr, code, state, pendingCallback);
            pendingCallback = null;
            pendingState = null;
            listener.onWeChatLoginResult(result);
        }
    };

    public interface WeChatLoginListener {
        void onWeChatLoginResult(WeChatLoginResult result);
    }

    public static class WeChatLoginResult {
        public final int errCode;
        @Nullable public final String errStr;
        @Nullable public final String code;
        @Nullable public final String state;
        @Nullable public final String callback;

        public WeChatLoginResult(int errCode, @Nullable String errStr, @Nullable String code,
                                 @Nullable String state, @Nullable String callback) {
            this.errCode = errCode;
            this.errStr = errStr;
            this.code = code;
            this.state = state;
            this.callback = callback;
        }
    }
}
