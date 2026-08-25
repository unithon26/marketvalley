import {
  ValidationProgress,
  type ValidationProgressStage,
} from "@/components/validation-progress";

export type GenerationProgressStage = ValidationProgressStage;

export function GenerationProgressView({
  current,
  reportHref,
  demoMode,
  onDemoAdvance,
}: {
  current: GenerationProgressStage;
  reportHref: string;
  demoMode: boolean;
  onDemoAdvance: () => void;
}) {
  return (
    <ValidationProgress
      current={current}
      reportHref={reportHref}
      demoMode={demoMode}
      onDemoAdvance={onDemoAdvance}
    />
  );
}
