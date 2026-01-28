package com.multigpt.android.app.wxapi;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

import androidx.annotation.Nullable;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.tencent.mm.opensdk.modelbase.BaseReq;
import com.tencent.mm.opensdk.modelbase.BaseResp;
import com.tencent.mm.opensdk.modelmsg.SendAuth;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.IWXAPIEventHandler;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;

import co.median.android.BuildConfig;
import co.median.android.WeChatLoginManager;

public class WXEntryActivity extends Activity implements IWXAPIEventHandler {
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
        Intent broadcast = new Intent(WeChatLoginManager.ACTION_WECHAT_LOGIN_RESULT);
        broadcast.putExtra(WeChatLoginManager.EXTRA_ERR_CODE, baseResp.errCode);
        broadcast.putExtra(WeChatLoginManager.EXTRA_ERR_STR, baseResp.errStr);

        if (baseResp instanceof SendAuth.Resp) {
            SendAuth.Resp resp = (SendAuth.Resp) baseResp;
            broadcast.putExtra(WeChatLoginManager.EXTRA_CODE, resp.code);
            broadcast.putExtra(WeChatLoginManager.EXTRA_STATE, resp.state);
        }

        LocalBroadcastManager.getInstance(this).sendBroadcast(broadcast);
        finish();
    }
}
