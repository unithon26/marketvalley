import {
  ValidationProgress,
  type ValidationProgressStage,
} from "@/components/validation-progress";

export type GenerationProgressStage = ValidationProgressStage;

export function GenerationProgressView({
  current,
  reportHref,
}: {
  current: GenerationProgressStage;
  reportHref: string;
}) {
  return (
    <ValidationProgress
      current={current}
      reportHref={reportHref}
      statusText="접수 내용을 저장하고 있어요"
    />
  );
}
