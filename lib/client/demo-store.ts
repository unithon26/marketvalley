import {
  nextActionSchema,
  signalOptionIdSchema,
  type NextAction,
  type SignalOptionId,
} from "@/lib/contracts/campaign";
import { seedSignals } from "@/lib/demo/demo-campaign";

const responseKey = "marketvalley:demo-response";
const actionKey = "marketvalley:demo-next-action";

export function readSignals(): SignalOptionId[] {
  if (typeof window === "undefined") return [...seedSignals];
  const response = signalOptionIdSchema.safeParse(window.localStorage.getItem(responseKey));
  return response.success ? [...seedSignals, response.data] : [...seedSignals];
}

export function hasResponded(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(responseKey) !== null;
}

export function saveSignal(optionId: SignalOptionId): boolean {
  if (hasResponded()) return false;
  window.localStorage.setItem(responseKey, optionId);
  window.dispatchEvent(new Event("marketvalley:demo-updated"));
  return true;
}

export function readNextAction(): NextAction | null {
  if (typeof window === "undefined") return null;
  const action = nextActionSchema.safeParse(window.localStorage.getItem(actionKey));
  return action.success ? action.data : null;
}

export function saveNextAction(action: NextAction): void {
  window.localStorage.setItem(actionKey, action);
}

export function resetDemo(): void {
  window.localStorage.removeItem(responseKey);
  window.localStorage.removeItem(actionKey);
  window.localStorage.removeItem("marketvalley:demo-draft");
  window.dispatchEvent(new Event("marketvalley:demo-updated"));
}
