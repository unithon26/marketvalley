export type MetaDraftCompletedResponse = {
  state: "completed";
  status: "PAUSED";
  operationKey: string;
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
  adsManagerUrl: string;
};

export type MetaDraftReconciliationResponse = {
  state: "reconciliation_required";
  operationKey: string;
  step: string;
  error: { code: "meta_reconciliation_required"; message: string };
};

export type MetaDraftClientResponse =
  | MetaDraftCompletedResponse
  | MetaDraftReconciliationResponse
  | { error: { code: string; message: string } };
