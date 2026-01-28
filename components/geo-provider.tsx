"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { RegionType } from "@/lib/architecture-modules/core/types";

interface GeoContextType {
  region: RegionType;
  countryCode: string;
  isChina: boolean;
  isLoading: boolean;
}

const GeoContext = createContext<GeoContextType>({
  region: RegionType.USA,
  countryCode: "US",
  isChina: false,
  isLoading: true,
});

export function GeoProvider({ children }: { children: ReactNode }) {
  const [geoData, setGeoData] = useState<GeoContextType>({
    region: RegionType.USA,
    countryCode: "US",
    isChina: false,
    isLoading: true,
  });

  useEffect(() => {
    // 只在客户端执行一次地理位置检测
    async function detectGeo() {
      try {
        // 调用 API 获取地理位置（Middleware 已经检测过 IP）
        const response = await fetch("/api/geo");
        if (!response.ok) {
          throw new Error("Failed to fetch geo data");
        }

        const data = await response.json();

        setGeoData({
          region: data.region || RegionType.USA,
          countryCode: data.countryCode || "US",
          isChina:
            data.region === RegionType.CHINA || data.countryCode === "CN",
          isLoading: false,
        });
      } catch (error) {
        console.error("Geo detection error:", error);

        // 降级处理：默认海外
        setGeoData({
          region: RegionType.USA,
          countryCode: "US",
          isChina: false,
          isLoading: false,
        });
      }
    }

    detectGeo();
  }, []); // 只执行一次

  return <GeoContext.Provider value={geoData}>{children}</GeoContext.Provider>;
}

// 导出 Hook 供组件使用
export function useGeo() {
  const context = useContext(GeoContext);
  if (!context) {
    throw new Error("useGeo must be used within GeoProvider");
  }
  return context;
}
