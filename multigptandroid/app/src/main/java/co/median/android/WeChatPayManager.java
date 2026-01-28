package co.median.android;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.text.TextUtils;
import android.util.Base64;
import android.util.Log;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.tencent.mm.opensdk.modelpay.PayReq;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/**
 * Lightweight WeChat Pay helper that bridges SDK callbacks back to the WebView.
 *
 * JS -> scheme: wechat-pay://start?callback=xxx&payload=base64(json)
 * payload json: { outTradeNo: string, appPayParams: {appid, partnerid, prepayid, package, noncestr, timestamp, sign} }
 */
public class WeChatPayManager {
    public static final String ACTION_WECHAT_PAY_RESULT = "co.median.android.action.WECHAT_PAY_RESULT";
    public static final String EXTRA_ERR_CODE = "errCode";
    public static final String EXTRA_ERR_STR = "errStr";
    public static final String EXTRA_OUT_TRADE_NO = "outTradeNo";

    private static final String TAG = "WeChatPay";

    private final Context appContext;
    private final IWXAPI wxApi;

    private String pendingCallback;
    private String pendingOutTradeNo;
    private WeChatPayListener listener;

    public WeChatPayManager(Context context) {
        this.appContext = context.getApplicationContext();
        this.wxApi = WXAPIFactory.createWXAPI(appContext, BuildConfig.WECHAT_APP_ID, false);
        if (!TextUtils.isEmpty(BuildConfig.WECHAT_APP_ID)) {
            this.wxApi.registerApp(BuildConfig.WECHAT_APP_ID);
        }
        Log.d(TAG, "init wxApi appId=" + BuildConfig.WECHAT_APP_ID + " installed=" + wxApi.isWXAppInstalled());
        LocalBroadcastManager.getInstance(appContext).registerReceiver(resultReceiver,
                new IntentFilter(ACTION_WECHAT_PAY_RESULT));
    }

    public void setListener(@Nullable WeChatPayListener listener) {
        this.listener = listener;
    }

    public boolean startPay(@Nullable String callback, @Nullable String payloadBase64) {
        if (TextUtils.isEmpty(BuildConfig.WECHAT_APP_ID)) {
            Toast.makeText(appContext, "微信AppId未配置", Toast.LENGTH_SHORT).show();
            Log.w(TAG, "startPay failed: empty appId");
            return false;
        }
        if (!wxApi.isWXAppInstalled()) {
            Toast.makeText(appContext, "未安装微信", Toast.LENGTH_SHORT).show();
            Log.w(TAG, "startPay failed: WeChat not installed");
            return false;
        }
        if (TextUtils.isEmpty(payloadBase64)) {
            Toast.makeText(appContext, "微信支付参数缺失", Toast.LENGTH_SHORT).show();
            Log.w(TAG, "startPay failed: empty payload");
            return false;
        }

        try {
            String json = new String(Base64.decode(payloadBase64, Base64.DEFAULT), StandardCharsets.UTF_8);
            JSONObject obj = new JSONObject(json);

            String outTradeNo = obj.optString("outTradeNo", "");
            JSONObject paramsObj = obj.optJSONObject("appPayParams");
            if (paramsObj == null) {
                // tolerate alternative keys
                paramsObj = obj.optJSONObject("params");
            }

            if (paramsObj == null) {
                Toast.makeText(appContext, "微信支付参数无效", Toast.LENGTH_SHORT).show();
                Log.w(TAG, "startPay failed: missing appPayParams");
                return false;
            }

            PayReq req = new PayReq();
            req.appId = paramsObj.optString("appid", BuildConfig.WECHAT_APP_ID);
            req.partnerId = paramsObj.optString("partnerid");
            req.prepayId = paramsObj.optString("prepayid");
            req.packageValue = paramsObj.optString("package");
            req.nonceStr = paramsObj.optString("noncestr");
            req.timeStamp = paramsObj.optString("timestamp");
            req.sign = paramsObj.optString("sign");
            // Use extData to carry outTradeNo so the callback can return it.
            req.extData = outTradeNo;

            this.pendingCallback = callback;
            this.pendingOutTradeNo = outTradeNo;

            boolean sent = wxApi.sendReq(req);
            Log.d(TAG, "sendReq pay result=" + sent + " outTradeNo=" + outTradeNo);
            if (!sent) {
                Toast.makeText(appContext, "微信支付请求发送失败", Toast.LENGTH_SHORT).show();
            }
            return sent;
        } catch (Exception e) {
            Log.e(TAG, "startPay parse/send error", e);
            Toast.makeText(appContext, "微信支付参数解析失败", Toast.LENGTH_SHORT).show();
            return false;
        }
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
            String outTradeNo = intent.getStringExtra(EXTRA_OUT_TRADE_NO);

            // Prefer explicit outTradeNo, fallback to pending.
            if (TextUtils.isEmpty(outTradeNo)) {
                outTradeNo = pendingOutTradeNo;
            }

            WeChatPayResult result = new WeChatPayResult(errCode, errStr, outTradeNo, pendingCallback);
            pendingCallback = null;
            pendingOutTradeNo = null;
            listener.onWeChatPayResult(result);
        }
    };

    public interface WeChatPayListener {
        void onWeChatPayResult(WeChatPayResult result);
    }

    public static class WeChatPayResult {
        public final int errCode;
        @Nullable public final String errStr;
        @Nullable public final String outTradeNo;
        @Nullable public final String callback;

        public WeChatPayResult(int errCode, @Nullable String errStr, @Nullable String outTradeNo, @Nullable String callback) {
            this.errCode = errCode;
            this.errStr = errStr;
            this.outTradeNo = outTradeNo;
            this.callback = callback;
        }
    }
}
