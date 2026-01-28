"use client";

import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  unit?: string;
  icon?: LucideIcon;
  cnValue: string | number;
  intlValue: string | number;
  cnChange?: number;
  intlChange?: number;
}

export function StatsCard({
  title,
  unit = "",
  icon: Icon,
  cnValue,
  intlValue,
  cnChange,
  intlChange,
}: StatsCardProps) {
  const formatValue = (val: string | number) => {
    if (typeof val === "number") {
      return val.toLocaleString();
    }
    return val;
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        {Icon && <Icon className="w-5 h-5 text-gray-400" />}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* CN 数据 */}
        <div className="border-r border-gray-200 pr-4">
          <div className="text-xs text-gray-500 mb-1">国内版 (CN)</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatValue(cnValue)}
            {unit && <span className="text-sm ml-1">{unit}</span>}
          </div>
          {cnChange !== undefined && (
            <div
              className={`text-xs mt-2 ${
                cnChange >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {cnChange >= 0 ? "↑" : "↓"} {Math.abs(cnChange)}%
            </div>
          )}
        </div>

        {/* INTL 数据 */}
        <div className="pl-4">
          <div className="text-xs text-gray-500 mb-1">国际版 (INTL)</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatValue(intlValue)}
            {unit && <span className="text-sm ml-1">{unit}</span>}
          </div>
          {intlChange !== undefined && (
            <div
              className={`text-xs mt-2 ${
                intlChange >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {intlChange >= 0 ? "↑" : "↓"} {Math.abs(intlChange)}%
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
