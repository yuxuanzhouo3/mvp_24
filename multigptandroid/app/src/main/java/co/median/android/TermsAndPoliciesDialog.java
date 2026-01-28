package co.median.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.Html;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.appcompat.app.AlertDialog;
import androidx.preference.PreferenceManager;

/**
 * Dialog for displaying Terms of Service, Privacy Policy, and Refund Policy
 * Shows only on first app launch
 */
public class TermsAndPoliciesDialog {

    private static final String PREFS_KEY_TERMS_ACCEPTED = "terms_and_policies_accepted";
    private static final String PREFS_KEY_TERMS_SHOWN = "terms_and_policies_shown";
    private final Context context;
    private final SharedPreferences preferences;

    public TermsAndPoliciesDialog(Context context) {
        this.context = context;
        this.preferences = PreferenceManager.getDefaultSharedPreferences(context);
    }

    /**
     * Check if terms dialog has been shown before (either accepted or declined)
     */
    public boolean hasTermsBeenShown() {
        return preferences.getBoolean(PREFS_KEY_TERMS_SHOWN, false);
    }

    /**
     * Check if user has already accepted the terms
     */
    public boolean hasUserAcceptedTerms() {
        return preferences.getBoolean(PREFS_KEY_TERMS_ACCEPTED, false);
    }

    /**
     * Mark terms as accepted
     */
    private void markTermsAsAccepted() {
        preferences.edit()
                .putBoolean(PREFS_KEY_TERMS_ACCEPTED, true)
                .putBoolean(PREFS_KEY_TERMS_SHOWN, true)
                .apply();
    }

    /**
     * Mark terms as declined (shown but not accepted)
     */
    private void markTermsAsDeclined() {
        preferences.edit()
                .putBoolean(PREFS_KEY_TERMS_ACCEPTED, false)
                .putBoolean(PREFS_KEY_TERMS_SHOWN, true)
                .apply();
    }

    /**
     * Show the terms and policies dialog
     */
    public void show() {
        if (hasTermsBeenShown()) {
            return; // Already shown (accepted or declined), don't show again
        }

        AlertDialog.Builder builder = new AlertDialog.Builder(context);
        builder.setTitle(context.getString(R.string.terms_and_policies_title));
        
        // Create custom view with scrollable content
        View dialogView = LayoutInflater.from(context).inflate(R.layout.dialog_terms_and_policies, null);
        ScrollView scrollView = dialogView.findViewById(R.id.scrollView);
        TextView contentTextView = dialogView.findViewById(R.id.termsContent);
        
        // Set the HTML content
        String htmlContent = getTermsAndPoliciesHtml();
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
            contentTextView.setText(Html.fromHtml(htmlContent, Html.FROM_HTML_MODE_COMPACT));
        } else {
            contentTextView.setText(Html.fromHtml(htmlContent));
        }
        
        builder.setView(dialogView);
        
        // Add buttons
        builder.setPositiveButton(context.getString(R.string.terms_accept), (dialog, which) -> {
            markTermsAsAccepted();
            dialog.dismiss();
        });
        
        builder.setNegativeButton(context.getString(R.string.terms_decline), (dialog, which) -> {
            // User declined - mark as shown and exit the app
            markTermsAsDeclined();
            dialog.dismiss();
            if (context instanceof android.app.Activity) {
                ((android.app.Activity) context).finish();
            }
            System.exit(0);
        });
        
        // Make dialog non-cancelable
        builder.setCancelable(false);
        
        AlertDialog dialog = builder.create();
        dialog.show();
    }

    /**
     * Get the HTML formatted terms and policies content
     */
    private String getTermsAndPoliciesHtml() {
        return "<html><body style=\"font-family: Arial; font-size: 14px;\">" +
                "<h2>服务条款</h2>" +
                "<h3>1. 服务描述</h3>" +
                "<p>MultiGPT 是多功能 AI 服务平台，为用户提供便捷的 AI 对话、模型调用和管理服务。</p>" +
                
                "<h3>2. 用户账户</h3>" +
                "<p>为了使用 MultiGPT 的完整功能，您需要注册一个账户。您同意提供真实、准确、完整的注册信息。</p>" +
                
                "<h3>3. 服务使用</h3>" +
                "<p>使用服务时，您同意遵守相关法律法规，不得滥用平台功能。</p>" +
                
                "<h3>4. 付费服务</h3>" +
                "<p>MultiGPT 提供免费功能和付费订阅计划。注意：MultiGPT 不提供自动续费功能，所有订阅均为用户主动购买。</p>" +
                
                "<h3>5. 知识产权</h3>" +
                "<p>MultiGPT平台及其原创内容、功能和设计受知识产权法保护。未经许可，您不得复制、修改或分发我们的内容。</p>" +
                
                "<h3>6. 隐私保护</h3>" +
                "<p>我们重视您的隐私，并承诺保护您的个人信息安全，不会出售您的个人信息。</p>" +
                
                "<h3>7. 服务变更与终止</h3>" +
                "<p>我们保留随时修改或终止服务的权利。如果您违反本条款，我们可能立即终止您的账户。</p>" +
                
                "<h3>8. 免责声明</h3>" +
                "<p>在法律允许的最大范围内，MultiGPT不承担服务中断或数据丢失等责任。</p>" +
                
                "<h3>9. 争议解决</h3>" +
                "<p>本条款受中华人民共和国法律管辖。如发生争议，双方应友好协商解决。</p>" +
                
                "<h2>隐私政策</h2>" +
                "<h3>1. 信息收集</h3>" +
                "<p>我们收集以下类型的信息：账户信息、使用数据、设备信息和位置信息。</p>" +
                
                "<h3>2. 信息使用</h3>" +
                "<p>我们使用收集的信息用于提供和改善服务，个性化用户体验，以及安全监控和欺诈防护。</p>" +
                
                "<h3>3. 信息保护</h3>" +
                "<p>我们采用行业标准的安全措施保护您的信息，包括数据加密传输和存储。</p>" +
                
                "<h3>4. 信息共享</h3>" +
                "<p>我们不会出售、出租或交易您的个人信息，仅在必要情况下与可信第三方共享。</p>" +
                
                "<h2>退款政策</h2>" +
                "<h3>1. 退款条件</h3>" +
                "<p>在重复扣费、服务故障或功能不符的情况下，您可以申请退款。</p>" +
                
                "<h3>2. 退款流程</h3>" +
                "<p>请发送邮件至 mornscience@gmail.com 提交退款申请。我们将在 1-3 个工作日内审核。</p>" +
                
                "<h3>3. 退款方式</h3>" +
                "<p>退款将原路返回到您的支付账户。微信支付 1-3 个工作日到账，其他方式 3-7 个工作日到账。</p>" +
                
                "<h3>4. 联系我们</h3>" +
                "<p>如有任何疑问，请发送邮件至：mornscience@gmail.com</p>" +
                
                "</body></html>";
    }
}
