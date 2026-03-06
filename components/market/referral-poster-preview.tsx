"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type ReferralPosterPreviewProps = {
  qrImageUrl: string;
  title: string;
  description: string;
  inviteCode?: string | null;
  ctaText: string;
  qrAlt: string;
  loadingText?: string;
  errorText?: string;
};

export function ReferralPosterPreview({
  qrImageUrl,
  title,
  description,
  inviteCode,
  ctaText,
  qrAlt,
  loadingText,
  errorText,
}: ReferralPosterPreviewProps) {
  const [isLoadingQr, setIsLoadingQr] = useState(true);
  const [isQrError, setIsQrError] = useState(false);

  useEffect(() => {
    setIsLoadingQr(true);
    setIsQrError(false);
  }, [qrImageUrl]);

  return (
    <div className="mx-auto w-full max-w-[320px] sm:max-w-[360px] rounded-2xl bg-gradient-to-br from-slate-900 via-blue-700 to-cyan-500 p-[1px]">
      <div className="rounded-2xl bg-gradient-to-br from-slate-100 via-blue-50 to-cyan-50 p-3 sm:p-4">
        <div className="rounded-xl border border-white/70 bg-white/90 p-3 sm:p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-[0.2em] text-blue-800 font-semibold">
            MultiGPT
          </div>
          <h4 className="mt-2 text-sm sm:text-base font-semibold text-slate-900 leading-5 sm:leading-6">
            {title}
          </h4>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-5">
            {description}
          </p>

          <div className="mx-auto mt-4 w-40 sm:w-48 rounded-xl border border-slate-200 bg-white p-2">
            <div className="relative h-36 w-36 sm:h-44 sm:w-44 mx-auto rounded-lg bg-slate-100/80">
              {isLoadingQr ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-[10px]">
                    {loadingText || "Loading QR..."}
                  </span>
                </div>
              ) : null}
              {isQrError ? (
                <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-[10px] text-red-500">
                  {errorText || "QR load failed"}
                </div>
              ) : null}
              <img
                src={qrImageUrl}
                alt={qrAlt}
                className={`h-36 w-36 sm:h-44 sm:w-44 rounded-lg object-contain mx-auto transition-opacity ${
                  isLoadingQr || isQrError ? "opacity-0" : "opacity-100"
                }`}
                onLoad={() => {
                  setIsLoadingQr(false);
                  setIsQrError(false);
                }}
                onError={() => {
                  setIsLoadingQr(false);
                  setIsQrError(true);
                }}
              />
            </div>
          </div>

          <p className="mt-3 text-center text-xs sm:text-sm font-medium text-slate-800">
            {ctaText}
          </p>

          {inviteCode ? (
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2 text-center text-[11px] sm:text-xs font-medium text-blue-700">
              {inviteCode}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
