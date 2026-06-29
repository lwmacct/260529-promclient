export type LabelMatcherOperator = "=" | "!=" | "=~" | "!~";

export type LabelMatcherInput = {
  name: string;
  operator: LabelMatcherOperator;
  value: string;
};

export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const regexList = (values: readonly string[]): string =>
  values.map((value) => escapeRegex(value)).join("|");

export const escapeLabelValue = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

export const labelMatcher = (
  name: string,
  operator: LabelMatcherOperator,
  value: string,
): string => `${name}${operator}"${escapeLabelValue(value)}"`;

export const regexLabelMatcher = (
  name: string,
  values: readonly string[],
  operator: Extract<LabelMatcherOperator, "=~" | "!~"> = "=~",
): string => `${name}${operator}"${escapeLabelValue(regexList(values))}"`;

export const labelMatchers = (matchers: readonly LabelMatcherInput[]): string =>
  matchers
    .map((matcher) =>
      labelMatcher(matcher.name, matcher.operator, matcher.value),
    )
    .join(",");

export const selector = (
  metricName: string,
  matchers: readonly LabelMatcherInput[] = [],
): string => {
  if (matchers.length === 0) {
    return metricName;
  }
  return `${metricName}{${labelMatchers(matchers)}}`;
};
