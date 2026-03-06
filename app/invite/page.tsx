"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Download, QrCode, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/components/user-context";
import { useLanguage } from "@/components/language-provider";
import { ReferralPosterPreview } from "@/components/market/referral-poster-preview";
import { buildReferralShareLink } from "@/lib/market/share-link";
import { isChinaRegion } from "@/lib/config/region";
import {
  canNativeShare,
  canSystemSharePoster,
  nativeShareLink,
  systemSharePoster,
} from "@/lib/market/share-client";
import {
  buildReferralPosterDataUrl,
  downloadReferralPoster,
} from "@/lib/market/share-poster";

type InviteSummary = {
  referralCode: string;
  shareUrl: string;
  clickCount: number;
  invitedCount: number;
  conversionRate: number;
  rewardCredits: number;
  rewardDays: number;
  totalRewardDays: number;
  firstPaymentRewardDays: number;
  inviterFirstUseBonus: number;
  invitedFirstUseBonus: number;
  inviterFirstPaymentBonus: number;
  invitedFirstPaymentBonus: number;
};

export default function InvitePage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const { language } = useLanguage();
  const isZh = language === "zh";

  const [summary, setSummary] = useState<InviteSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const [posterShareAvailable, setPosterShareAvailable] = useState(false);
  const [savingPoster, setSavingPoster] = useState(false);
  const [sharingPoster, setSharingPoster] = useState(false);
  const [shareHint, setShareHint] = useState("");

  const ui = useMemo(
    () =>
      isZh
        ? {
            loading: "加载中...",
            back: "返回",
            loginRequired: "请先登录",
            login: "去登录",
            title: "邀请中心",
            subtitle: "邀请奖励已切换为会员天数，支持首次使用与首次付费双奖励。",
            shareLinkTitle: "分享链接",
            copy: "复制",
            shareApps: "系统分享到应用",
            referralCode: "邀请码",
            webHint:
              "当前 Web 环境无法直接唤起系统分享，点击按钮会自动复制邀请链接。",
            copySuccess: "邀请链接已复制",
            copyFailed: "复制失败，请稍后重试",
            openShareSuccess: "已打开系统分享面板",
            shareUnavailableCopied: "当前环境不支持系统分享，已复制邀请链接",
            shareUnavailable: "系统分享不可用，请手动复制链接分享",
            shareText: "我在 MultiGPT 使用这个工具，推荐你试试",
            qrInvite: "二维码邀请",
            noQr: "暂无二维码",
            noQrLink: "暂无二维码链接",
            copyQrLink: "复制二维码链接",
            downloadQr: "下载二维码",
            downloading: "下载中...",
            qrSourceHint: "二维码链接自动附带 ",
            qrAttributionTail: "用于后台渠道归因统计。",
            posterTitle: "邀请海报",
            posterDescription: "扫码注册并体验 MultiGPT，双方均可获得会员奖励。",
            posterCtaText: "扫码打开并开始使用",
            savePoster: "保存海报",
            savingPoster: "保存中...",
            sharePoster: "系统分享海报",
            sharingPoster: "分享中...",
            posterSaved: "海报已保存",
            posterSaveFailed: "保存失败，请重试",
            posterShareFailed: "系统分享失败，请先保存海报再分享",
            posterHint: "适合分享到朋友圈/群聊，扫码后自动记录邀请归因。",
            statClicks: "点击",
            statInvites: "邀请",
            statRewardDays: "累计奖励天数",
            statRate: "转化率",
            rewardRules: "奖励规则",
            firstUse: "首次使用",
            firstPayment: "首次付费",
            firstPaymentTotal: "累计首次付费奖励天数",
            inviter: "邀请人",
            invited: "被邀请人",
            dayUnit: "天",
          }
        : {
            loading: "Loading...",
            back: "Back",
            loginRequired: "Please sign in",
            login: "Sign in",
            title: "Invite Center",
            subtitle:
              "Rewards are membership days. Both first-use and first-payment rewards are enabled.",
            shareLinkTitle: "Share Link",
            copy: "Copy",
            shareApps: "Share via Apps",
            referralCode: "Invite Code",
            webHint:
              "Web mode cannot open native share directly. The share button will copy your link instead.",
            copySuccess: "Invite link copied",
            copyFailed: "Copy failed, please try again",
            openShareSuccess: "System share opened",
            shareUnavailableCopied:
              "Native share unavailable, invite link copied",
            shareUnavailable: "Native share unavailable. Please copy and share",
            shareText:
              "I am using this feature on MultiGPT, you should try it too",
            qrInvite: "QR Invite",
            noQr: "QR unavailable",
            noQrLink: "QR link unavailable",
            copyQrLink: "Copy QR Link",
            downloadQr: "Download QR",
            downloading: "Downloading...",
            qrSourceHint: "QR links include ",
            qrAttributionTail: "for attribution analytics in market reports.",
            posterTitle: "Invite Poster",
            posterDescription:
              "Scan to join MultiGPT and get membership rewards together.",
            posterCtaText: "Scan to open and start using",
            savePoster: "Save Poster",
            savingPoster: "Saving...",
            sharePoster: "Share Poster",
            sharingPoster: "Sharing...",
            posterSaved: "Poster saved",
            posterSaveFailed: "Save failed, please retry",
            posterShareFailed:
              "System share failed. Please save the poster first.",
            posterHint:
              "Great for social feeds or group chats. Invite attribution is preserved after scan.",
            statClicks: "Clicks",
            statInvites: "Invites",
            statRewardDays: "Reward Days",
            statRate: "Conversion",
            rewardRules: "Reward Rules",
            firstUse: "First Use",
            firstPayment: "First Payment",
            firstPaymentTotal: "Total First-payment Reward Days",
            inviter: "Inviter",
            invited: "Invitee",
            dayUnit: "days",
          },
    [isZh]
  );

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setBusy(true);
    setError("");

    try {
      const region = isChinaRegion() ? "CN" : "INTL";
      const response = await fetch(
        `/api/invite/summary?userId=${encodeURIComponent(String(user.id))}&region=${region}`,
        { cache: "no-store" }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Failed to load invite summary");
      }
      setSummary(result.summary || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load invite summary");
    } finally {
      setBusy(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setNativeShareAvailable(canNativeShare());
    setPosterShareAvailable(canSystemSharePoster());
  }, []);

  if (loading) {
    return <div className="container mx-auto px-4 py-8">{ui.loading}</div>;
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-4">
        <Button variant="ghost" className="px-1" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {ui.back}
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>{ui.loginRequired}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/auth")}>{ui.login}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const copyShareUrl =
    summary?.referralCode && origin
      ? buildReferralShareLink({
          origin,
          referralCode: summary.referralCode,
          source: "copy",
          targetPath: "/",
        })
      : summary?.shareUrl || "";
  const androidShareUrl =
    summary?.referralCode && origin
      ? buildReferralShareLink({
          origin,
          referralCode: summary.referralCode,
          source: "android_share",
          targetPath: "/",
        })
      : summary?.shareUrl || "";

  const copyLink = async () => {
    if (!copyShareUrl) return;
    try {
      await navigator.clipboard.writeText(copyShareUrl);
      setShareHint(ui.copySuccess);
    } catch {
      setShareHint(ui.copyFailed);
    }
  };

  const qrShareUrl =
    summary?.referralCode && origin
      ? buildReferralShareLink({
          origin,
          referralCode: summary.referralCode,
          source: "qr",
          targetPath: "/",
        })
      : "";
  const qrImageUrl = qrShareUrl
    ? `/api/tools/qr?size=280&ecc=M&data=${encodeURIComponent(qrShareUrl)}`
    : "";
  const posterShareUrl =
    summary?.referralCode && origin
      ? buildReferralShareLink({
          origin,
          referralCode: summary.referralCode,
          source: "poster",
          targetPath: "/",
        })
      : "";
  const posterQrImageUrl = posterShareUrl
    ? `/api/tools/qr?size=400&ecc=M&data=${encodeURIComponent(posterShareUrl)}`
    : "";

  const shareToSystemApps = async () => {
    if (!androidShareUrl) return;

    try {
      nativeShareLink({
        url: androidShareUrl,
        text: ui.shareText,
      });
      setShareHint(ui.openShareSuccess);
      return;
    } catch {
      try {
        await navigator.clipboard.writeText(androidShareUrl);
        setShareHint(ui.shareUnavailableCopied);
        return;
      } catch {
        setShareHint(ui.shareUnavailable);
      }
    }
  };

  const copyQrLink = async () => {
    if (!qrShareUrl) return;
    try {
      await navigator.clipboard.writeText(qrShareUrl);
    } catch {
      // noop
    }
  };

  const savePoster = async () => {
    if (!posterQrImageUrl) return;
    setSavingPoster(true);
    try {
      await downloadReferralPoster({
        qrImageUrl: posterQrImageUrl,
        title: ui.posterTitle,
        description: ui.posterDescription,
        inviteCode: summary?.referralCode || "",
        ctaText: ui.posterCtaText,
        language: isZh ? "zh" : "en",
        fileName: "multigpt-invite-poster.png",
      });
      setShareHint(ui.posterSaved);
    } catch {
      setShareHint(ui.posterSaveFailed);
    } finally {
      setSavingPoster(false);
    }
  };

  const sharePosterToApps = async () => {
    if (!posterQrImageUrl) return;
    setSharingPoster(true);
    try {
      const posterDataUrl = await buildReferralPosterDataUrl({
        qrImageUrl: posterQrImageUrl,
        title: ui.posterTitle,
        description: ui.posterDescription,
        inviteCode: summary?.referralCode || "",
        ctaText: ui.posterCtaText,
        language: isZh ? "zh" : "en",
      });
      await systemSharePoster({
        posterDataUrl,
        fileName: "multigpt-invite-poster.png",
        text: ui.shareText,
        fallbackUrl: androidShareUrl,
        allowLinkFallback: false,
      });
      setShareHint(ui.openShareSuccess);
    } catch {
      setShareHint(ui.posterShareFailed);
    } finally {
      setSharingPoster(false);
    }
  };

  const downloadQr = async () => {
    if (!qrImageUrl) return;

    setDownloadingQr(true);
    try {
      const response = await fetch(qrImageUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to download qr image");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `invite-qr-${summary?.referralCode || "code"}.png`;
      anchor.rel = "noopener";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      // noop
    } finally {
      setDownloadingQr(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-5">
      <Button variant="ghost" className="px-1" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4 mr-1" /> {ui.back}
      </Button>

      <div>
        <h1 className="text-2xl font-semibold">{ui.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ui.subtitle}
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{ui.shareLinkTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            readOnly
            value={copyShareUrl}
            placeholder={busy ? ui.loading : ui.shareLinkTitle}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Button variant="outline" onClick={copyLink} disabled={!copyShareUrl}>
              <Copy className="h-4 w-4 mr-1" /> {ui.copy}
            </Button>
            <Button onClick={shareToSystemApps} disabled={!androidShareUrl}>
              <Send className="h-4 w-4 mr-1" />
              {ui.shareApps}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {ui.referralCode}：{summary?.referralCode || "-"}
          </div>
          {shareHint ? (
            <div className="text-xs text-muted-foreground">{shareHint}</div>
          ) : null}
          {!nativeShareAvailable ? (
            <div className="text-xs text-muted-foreground">
              {ui.webHint}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-4 w-4" />
            {ui.qrInvite}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col items-center justify-center rounded-lg border bg-white p-4">
            {qrImageUrl ? (
              <img
                src={qrImageUrl}
                alt={ui.qrInvite}
                className="h-56 w-56 rounded-md border"
              />
            ) : (
              <div className="h-56 w-56 rounded-md border border-dashed text-sm text-muted-foreground grid place-items-center">
                {ui.noQr}
              </div>
            )}
          </div>
          <Input
            readOnly
            value={qrShareUrl}
            placeholder={busy ? ui.loading : ui.noQrLink}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={copyQrLink} disabled={!qrShareUrl}>
              <Copy className="h-4 w-4 mr-1" />
              {ui.copyQrLink}
            </Button>
            <Button variant="outline" onClick={downloadQr} disabled={!qrImageUrl || downloadingQr}>
              <Download className="h-4 w-4 mr-1" />
              {downloadingQr ? ui.downloading : ui.downloadQr}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {ui.qrSourceHint}
            <code>source=qr</code>
            {" "}
            {ui.qrAttributionTail}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ui.posterTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ReferralPosterPreview
            qrImageUrl={posterQrImageUrl}
            qrAlt={ui.posterTitle}
            title={ui.posterTitle}
            description={ui.posterDescription}
            inviteCode={summary?.referralCode || ""}
            ctaText={ui.posterCtaText}
            loadingText={ui.loading}
            errorText={ui.noQr}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={savePoster}
              disabled={!posterQrImageUrl || savingPoster || sharingPoster}
            >
              <Download className="h-4 w-4 mr-1" />
              {savingPoster ? ui.savingPoster : ui.savePoster}
            </Button>
            {posterShareAvailable ? (
              <Button
                onClick={sharePosterToApps}
                disabled={!posterQrImageUrl || savingPoster || sharingPoster}
              >
                <Send className="h-4 w-4 mr-1" />
                {sharingPoster ? ui.sharingPoster : ui.sharePoster}
              </Button>
            ) : (
              <Button variant="outline" onClick={shareToSystemApps} disabled={!androidShareUrl}>
                <Send className="h-4 w-4 mr-1" />
                {ui.shareApps}
              </Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{ui.posterHint}</div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">{ui.statClicks}</div>
            <div className="text-2xl font-semibold">{summary?.clickCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">{ui.statInvites}</div>
            <div className="text-2xl font-semibold">{summary?.invitedCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">{ui.statRewardDays}</div>
            <div className="text-2xl font-semibold">{summary?.totalRewardDays || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">{ui.statRate}</div>
            <div className="text-2xl font-semibold">{summary?.conversionRate || 0}%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{ui.rewardRules}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div>
            {ui.firstUse}：{ui.inviter} +{summary?.inviterFirstUseBonus || 7}{" "}
            {ui.dayUnit}，{ui.invited} +{summary?.invitedFirstUseBonus || 3}{" "}
            {ui.dayUnit}
          </div>
          <div>
            {ui.firstPayment}：{ui.inviter} +
            {summary?.inviterFirstPaymentBonus || 30} {ui.dayUnit}，{ui.invited} +
            {summary?.invitedFirstPaymentBonus || 7} {ui.dayUnit}
          </div>
          <div>
            {ui.firstPaymentTotal}：{summary?.firstPaymentRewardDays || 0}{" "}
            {ui.dayUnit}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
