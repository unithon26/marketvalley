import { z } from "zod";

import {
  campaignSpecSchema,
  nextActionSchema,
} from "@/lib/contracts/campaign";
import type { CampaignSpec } from "@/lib/contracts/campaign";
import type { PublishedCampaign, ReservationSummary } from "@/lib/contracts/repository";
import type { CampaignAnalytics } from "@/lib/contracts/analytics";

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

const utmFieldSchema = z.string().trim().min(1).max(100).optional();

export const recordReservationRequestSchema = z.object({
  campaignId: identifierSchema,
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  consent: z.literal(true),
  turnstileToken: z.string().trim().min(1).max(2_048).optional(),
  utm: z.object({
    source: utmFieldSchema,
    medium: utmFieldSchema,
    campaign: utmFieldSchema,
    content: utmFieldSchema,
  }).strict().optional(),
}).strict();

export type PublishCampaignRequest = z.infer<typeof publishCampaignRequestSchema>;
export type UpdateCampaignRequest = z.infer<typeof updateCampaignRequestSchema>;
export type DeleteCampaignRequest = z.infer<typeof deleteCampaignRequestSchema>;
export type ResetCampaignRequest = z.infer<typeof resetCampaignRequestSchema>;
export type RecordReservationRequest = z.infer<typeof recordReservationRequestSchema>;

export type GenerateCampaignResponse = {
  spec: CampaignSpec;
};

export type CampaignResponse = PublishedCampaign & {
  url: string;
  summary: ReservationSummary;
  analytics: CampaignAnalytics;
};

export type RecordReservationResponse = {
  alreadyReserved: boolean;
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    issues?: Array<{ path: string; message: string }>;
  };
};
