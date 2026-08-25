import {
  ValidationProgress,
} from "@/components/validation-progress";

export function ProgressView({ campaignId }: { campaignId: string }) {
  return <ValidationProgress current={3} reportHref={`/campaigns/${campaignId}`} />;
}
