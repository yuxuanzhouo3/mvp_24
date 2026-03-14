"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useUser } from "@/components/user-context";
import {
  ensureAdvertisementBatchLoaded,
  getAdvertisementBatchSnapshot,
  subscribeToAdvertisementBatch,
  type Advertisement,
  type AdvertisementPosition,
} from "@/lib/ads/client-cache";

interface AdDisplayProps {
  position: AdvertisementPosition;
}

export function AdDisplay({ position }: AdDisplayProps) {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { user } = useUser();

  // 检查用户是否是会员
  const membershipExpiryDate = user?.membership_expires_at
    ? new Date(user.membership_expires_at)
    : null;
  const hasValidExpiryDate =
    !!membershipExpiryDate && Number.isFinite(membershipExpiryDate.getTime());
  const isExpired = hasValidExpiryDate && membershipExpiryDate <= new Date();
  const isMember = Boolean(
    user &&
      ((typeof user.hasActiveSubscription === "boolean"
        ? user.hasActiveSubscription
        : user.subscription_plan &&
          user.subscription_plan.toLowerCase() !== "free") &&
        !isExpired)
  );

  useEffect(() => {
    if (isMember) {
      setAds([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const syncAdsFromSnapshot = () => {
      const snapshot = getAdvertisementBatchSnapshot();
      if (!snapshot || cancelled) return false;
      setAds(snapshot[position] || []);
      setLoading(false);
      return true;
    };

    setLoading(true);
    syncAdsFromSnapshot();

    const unsubscribe = subscribeToAdvertisementBatch(() => {
      syncAdsFromSnapshot();
    });

    void ensureAdvertisementBatchLoaded()
      .then((batch) => {
        if (cancelled) return;
        setAds(batch[position] || []);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        if (process.env.NODE_ENV === "development") {
          console.warn(`[ads] failed to load position "${position}":`, error);
        }
        setAds([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [position, isMember]);

  useEffect(() => {
    if (isMember) {
      setDismissed(new Set());
    }
  }, [isMember]);

  const availableAds = ads.filter((ad) => !dismissed.has(ad.id));

  if (isMember || loading || availableAds.length === 0) {
    return null;
  }

  const ad = availableAds[0];

  const handleDismiss = () => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(ad.id);
      return next;
    });
  };

  const handleClick = () => {
    if (ad.target_url) {
      window.open(ad.target_url, "_blank");
    }
  };

  const positionStyles: Record<AdvertisementPosition, string> = {
    top: "w-[728px] h-16 top-16 left-1/2 -translate-x-1/2",
    bottom: "w-full h-24 bottom-0 left-0 right-0",
    left: "w-48 h-48 left-2 top-1/2 -translate-y-1/2",
    right: "w-48 h-48 right-2 top-1/2 -translate-y-1/2",
    sidebar: "w-full h-32 left-0",
    "bottom-left": "w-64 h-40 bottom-4 left-4",
    "bottom-right": "w-64 h-40 bottom-4 right-4",
  };

  const adContainerClass = positionStyles[position];

  return (
    <div className={`fixed ${adContainerClass} z-50 pointer-events-auto`}>
      <div className="relative group w-full h-full">
        <div
          className="relative w-full h-full bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow duration-200"
          onClick={handleClick}
        >
          {ad.media_type === "image" ? (
            <img
              src={ad.media_url}
              alt={ad.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <video
              src={ad.media_url}
              className="w-full h-full object-cover"
              controls
              preload="metadata"
            />
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="absolute top-2 right-2 p-1 bg-black/60 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
            title="关闭广告"
          >
            <X className="w-4 h-4" />
          </button>

          {ad.target_url && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-center justify-center">
              <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                点击打开
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
