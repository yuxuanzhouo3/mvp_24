"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useUser } from "@/components/user-context";

interface Advertisement {
  id: string;
  title: string;
  position: "top" | "bottom" | "left" | "right" | "sidebar" | "bottom-left" | "bottom-right";
  media_type: "image" | "video";
  media_url: string;
  target_url: string | null;
  priority: number;
}

interface AdDisplayProps {
  position: Advertisement["position"];
}

export function AdDisplay({ position }: AdDisplayProps) {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { user } = useUser();

  // 检查用户是否是会员
  const isMember = user && user.subscription_plan && user.subscription_plan !== "free";

  // 如果是会员，不显示广告
  if (isMember) {
    return null;
  }

  useEffect(() => {
    const loadAds = async () => {
      try {
        console.log(`[AdDisplay] Fetching ads for position: ${position}`);
        const response = await fetch(`/api/advertisements?position=${position}`, {
          cache: "no-store", // 禁用浏览器缓存
        });
        const data = await response.json();
        console.log(`[AdDisplay] Response for ${position}:`, data);
        if (data.success && data.data) {
          setAds(data.data);
          console.log(`[AdDisplay] Loaded ${data.data.length} ads for position ${position}`);
        } else {
          setAds([]);
          console.log(`[AdDisplay] No ads or error for position ${position}`);
        }
      } catch (err) {
        console.error("Failed to load ads:", err);
      } finally {
        setLoading(false);
      }
    };

    loadAds();
    
    // 定期检查广告状态（15秒一次），确保禁用的广告能立即移除
    const interval = setInterval(() => {
      console.log(`[AdDisplay] Polling ads for position: ${position}`);
      loadAds();
    }, 15000);
    return () => clearInterval(interval);
  }, [position]);

  const availableAds = ads.filter(ad => !dismissed.has(ad.id));

  if (loading || availableAds.length === 0) {
    return null;
  }

  // 获取优先级最高的广告
  const ad = availableAds[0];

  const handleDismiss = () => {
    setDismissed(prev => new Set(prev).add(ad.id));
  };

  const handleClick = () => {
    if (ad.target_url) {
      window.open(ad.target_url, "_blank");
    }
  };

  // 根据位置应用不同的样式
  const positionStyles = {
    top: "w-[728px] h-16 top-16 left-1/2 -translate-x-1/2",     // 顶部：728x64（标准横幅），居中
    bottom: "w-full h-24 bottom-0 left-0 right-0",      // 底部：全宽，96px高
    left: "w-48 h-48 left-2 top-1/2 -translate-y-1/2",  // 左侧：192px × 192px，居中
    right: "w-48 h-48 right-2 top-1/2 -translate-y-1/2", // 右侧：192px × 192px，居中
    sidebar: "w-full h-32 left-0",                       // 侧边栏：全宽，128px高
    "bottom-left": "w-64 h-40 bottom-4 left-4",         // 底部左：256px × 160px
    "bottom-right": "w-64 h-40 bottom-4 right-4",       // 底部右：256px × 160px
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

          {/* 关闭按钮 */}
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

          {/* 链接提示 */}
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
