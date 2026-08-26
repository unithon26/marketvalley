export const META_OPERATION_QUOTA_ERROR_CODE = "meta_operation_quota_exceeded";
export const LEGACY_META_OPERATION_QUOTA_ERROR_CODE = "meta_operation_quota_exceeded_error";

const quotaResetBufferMinutes = 1;

export type MetaOperationQuotaRetryPlan = {
  nextAttemptAt: string;
  lastErrorCode: typeof META_OPERATION_QUOTA_ERROR_CODE;
  lastErrorMessage: string;
};

export function isMetaOperationQuotaErrorCode(value: string | null): boolean {
  return value === META_OPERATION_QUOTA_ERROR_CODE
    || value === LEGACY_META_OPERATION_QUOTA_ERROR_CODE;
}

export function needsFreshMetaDraftWindow(options: {
  startsAt: string | null;
  endsAt: string | null;
  now: Date;
  afterQuotaWait: boolean;
}): boolean {
  const startsAt = options.startsAt === null ? Number.NaN : new Date(options.startsAt).getTime();
  const endsAt = options.endsAt === null ? Number.NaN : new Date(options.endsAt).getTime();
  const now = options.now.getTime();
  return !Number.isFinite(startsAt)
    || !Number.isFinite(endsAt)
    || !Number.isFinite(now)
    || endsAt <= now
    || (options.afterQuotaWait && startsAt <= now);
}

function koreanDateTime(value: Date): string {
  const korea = new Date(value.getTime() + 9 * 60 * 60 * 1_000);
  return `${korea.getUTCMonth() + 1}월 ${korea.getUTCDate()}일 ${String(korea.getUTCHours()).padStart(2, "0")}:${String(korea.getUTCMinutes()).padStart(2, "0")}`;
}

export function metaOperationQuotaRetryPlan(now: Date): MetaOperationQuotaRetryPlan {
  if (!Number.isFinite(now.getTime())) throw new TypeError("now must be a valid date");

  // acquire_meta_ad_operation counts usage by UTC date. Wait through the
  // boundary plus one minute so a worker tick cannot race the date rollover.
  const nextAttempt = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    quotaResetBufferMinutes,
  ));

  return {
    nextAttemptAt: nextAttempt.toISOString(),
    lastErrorCode: META_OPERATION_QUOTA_ERROR_CODE,
    lastErrorMessage: `설정된 광고 생성 일일 한도에 도달했습니다. ${koreanDateTime(nextAttempt)} 이후 자동으로 다시 시도합니다.`,
  };
}
