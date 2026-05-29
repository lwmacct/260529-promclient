import type { PromQueryTime } from "./types";

export type StepOption = {
  seconds: number;
  value: string;
};

export const defaultStepOptions: StepOption[] = [
  { seconds: 60, value: "1m" },
  { seconds: 5 * 60, value: "5m" },
  { seconds: 10 * 60, value: "10m" },
  { seconds: 15 * 60, value: "15m" },
  { seconds: 30 * 60, value: "30m" },
  { seconds: 60 * 60, value: "1h" },
  { seconds: 2 * 60 * 60, value: "2h" },
  { seconds: 3 * 60 * 60, value: "3h" },
  { seconds: 4 * 60 * 60, value: "4h" },
  { seconds: 6 * 60 * 60, value: "6h" },
  { seconds: 12 * 60 * 60, value: "12h" },
  { seconds: 24 * 60 * 60, value: "1d" },
];

export const serializeTime = (time: PromQueryTime): string => {
  if (time instanceof Date) {
    return String(time.getTime() / 1000);
  }
  return String(time);
};

export const getAdaptiveStep = (
  seconds: number,
  maxPoints: number,
  steps: readonly StepOption[] = defaultStepOptions,
): string => {
  if (seconds <= 0) {
    throw new Error("seconds must be greater than 0.");
  }
  if (maxPoints <= 0) {
    throw new Error("maxPoints must be greater than 0.");
  }
  if (steps.length === 0) {
    throw new Error("steps must not be empty.");
  }

  const sortedSteps = [...steps].sort((a, b) => a.seconds - b.seconds);
  const minStepSeconds = seconds / maxPoints;
  return (
    sortedSteps.find((step) => step.seconds >= minStepSeconds) ??
    sortedSteps[sortedSteps.length - 1]
  ).value;
};
