package com.multigpt.android.app.wxapi;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

import androidx.annotation.Nullable;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.tencent.mm.opensdk.modelbase.BaseReq;
import com.tencent.mm.opensdk.modelbase.BaseResp;
import com.tencent.mm.opensdk.modelpay.PayResp;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.IWXAPIEventHandler;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;

import co.median.android.BuildConfig;
import co.median.android.WeChatPayManager;

/**
 * WeChat Pay callback activity.
 *
 * Must be located at: <applicationId>.wxapi.WXPayEntryActivity
 * (package com.multigpt.android.app.wxapi)
 */
public class WXPayEntryActivity extends Activity implements IWXAPIEventHandler {
    private IWXAPI wxApi;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        wxApi = WXAPIFactory.createWXAPI(this, BuildConfig.WECHAT_APP_ID, false);
        if (wxApi != null) {
            wxApi.handleIntent(getIntent(), this);
        } else {
            finish();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (wxApi != null) {
            wxApi.handleIntent(intent, this);
        }
    }

    @Override
    public void onReq(BaseReq baseReq) {
        finish();
    }

    @Override
    public void onResp(BaseResp baseResp) {
        Intent broadcast = new Intent(WeChatPayManager.ACTION_WECHAT_PAY_RESULT);
        broadcast.putExtra(WeChatPayManager.EXTRA_ERR_CODE, baseResp.errCode);
        broadcast.putExtra(WeChatPayManager.EXTRA_ERR_STR, baseResp.errStr);

        if (baseResp instanceof PayResp) {
            PayResp resp = (PayResp) baseResp;
            // extData is set from PayReq.extData
            broadcast.putExtra(WeChatPayManager.EXTRA_OUT_TRADE_NO, resp.extData);
        }

        LocalBroadcastManager.getInstance(this).sendBroadcast(broadcast);
        finish();
    }
}
