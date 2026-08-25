"use client";

import { useEffect, useState } from "react";
import {
  ValidationProgress,
  type ValidationProgressStage,
} from "@/components/validation-progress";

export function ProgressView({ campaignId }: { campaignId: string }) {
  const [current, setCurrent] = useState<ValidationProgressStage>(0);

  useEffect(() => {
    const timers = ([1, 2, 3] as const).map((stage) => window.setTimeout(() => setCurrent(stage), stage * 700));
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return <ValidationProgress current={current} reportHref={`/campaigns/${campaignId}`} />;
}
