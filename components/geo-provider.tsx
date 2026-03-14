"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";
import { RegionType } from "@/lib/architecture-modules/core/types";
import {
  buildGeoClientState,
  parseGeoClientStateFromCookieString,
} from "@/lib/geo/state";

interface GeoContextType {
  region: RegionType;
  countryCode: string;
  isChina: boolean;
  isLoading: boolean;
}

const GeoContext = createContext<GeoContextType>({
  ...buildGeoClientState(),
});

export function GeoProvider({ children }: { children: ReactNode }) {
  const [geoData] = useState<GeoContextType>(() => {
    if (typeof document === "undefined") {
      return buildGeoClientState();
    }

    return parseGeoClientStateFromCookieString(document.cookie);
  });

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
