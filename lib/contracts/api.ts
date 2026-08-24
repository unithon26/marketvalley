import { z } from "zod";

import {
  campaignSpecSchema,
  nextActionSchema,
  signalOptionIdSchema,
  type CampaignSpec,
} from "@/lib/contracts/campaign";
import type { PublishedCampaign, SignalSummary } from "@/lib/contracts/repository";

const identifierSchema = z.string().trim().min(1).max(100);

export const publishCampaignRequestSchema = z.object({
  draftId: identifierSchema,
  spec: campaignSpecSchema,
}).strict();

export const campaignIdQuerySchema = z.object({
  id: identifierSchema,
}).strict();

export const updateCampaignRequestSchema = z.object({
  campaignId: identifierSchema,
  draftId: identifierSchema,
  nextAction: nextActionSchema,
}).strict();

export const deleteCampaignRequestSchema = z.object({
  campaignId: identifierSchema,
  draftId: identifierSchema,
}).strict();

export const resetCampaignRequestSchema = deleteCampaignRequestSchema;

export const recordSignalRequestSchema = z.object({
  campaignId: identifierSchema,
  visitorId: z.string().trim().min(8).max(200),
  optionId: signalOptionIdSchema,
}).strict();

export type PublishCampaignRequest = z.infer<typeof publishCampaignRequestSchema>;
export type UpdateCampaignRequest = z.infer<typeof updateCampaignRequestSchema>;
export type DeleteCampaignRequest = z.infer<typeof deleteCampaignRequestSchema>;
export type ResetCampaignRequest = z.infer<typeof resetCampaignRequestSchema>;
export type RecordSignalRequest = z.infer<typeof recordSignalRequestSchema>;

export type GenerateCampaignResponse = {
  spec: CampaignSpec;
};

export type CampaignResponse = PublishedCampaign & {
  url: string;
  summary: SignalSummary;
};

export type RecordSignalResponse = {
  alreadyResponded: boolean;
  summary: SignalSummary;
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    issues?: Array<{ path: string; message: string }>;
  };
};
