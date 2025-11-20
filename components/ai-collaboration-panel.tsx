"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, Zap, ArrowRight, Clock, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";

interface AICollaborationPanelProps {
  selectedGPTs: any[];
  isProcessing: boolean;
}

export function AICollaborationPanel({
  selectedGPTs,
  isProcessing,
}: AICollaborationPanelProps) {
  const { language } = useLanguage();
  const t = useTranslations(language);

  const getAIStatus = (gpt: any, index: number) => {
    if (!isProcessing) return "pending";
    if (index === 0) return "processing";
    if (index < selectedGPTs.length - 1) return "completed";
    return "pending";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processing":
        return "bg-blue-500";
      case "completed":
        return "bg-green-500";
      default:
        return "bg-gray-300";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processing":
        return <Zap className="w-3 h-3 text-white animate-pulse" />;
      case "completed":
        return <CheckCircle2 className="w-3 h-3 text-white" />;
      default:
        return <Clock className="w-3 h-3 text-white" />;
    }
  };

  if (selectedGPTs.length === 0) return null;

  return (
    <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-blue-900">
            {t.collaboration.title}
          </h3>
        </div>
        {isProcessing && (
          <Badge
            variant="secondary"
            className="bg-blue-100 text-blue-800 animate-pulse"
          >
            {t.collaboration.autoWorking}
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        {selectedGPTs.map((gpt, index) => {
          const status = getAIStatus(gpt, index);

          return (
            <div key={gpt.id} className="flex items-center space-x-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${getStatusColor(
                  status
                )}`}
              >
                {getStatusIcon(status)}
              </div>

              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-sm">{gpt.name}</span>
                  {gpt.type === "organization" && (
                    <Badge variant="outline" className="text-xs">
                      {t.collaboration.members}: {gpt.members?.length || 0}
                    </Badge>
                  )}
                </div>

                {gpt.type === "organization" && (
                  <div className="text-xs text-gray-600 mt-1">
                    {t.collaboration.autoCoordinating}
                  </div>
                )}

                {status === "processing" && (
                  <Progress value={65} className="w-full h-2 mt-2" />
                )}
              </div>

              {index < selectedGPTs.length - 1 && (
                <ArrowRight className="w-4 h-4 text-gray-400" />
              )}
            </div>
          );
        })}
      </div>

      {isProcessing && (
        <div className="mt-4 p-3 bg-white/50 rounded-lg">
          <div className="text-sm text-gray-700">
            {t.collaboration.aiTeamWorking}
          </div>
        </div>
      )}
    </Card>
  );
}
