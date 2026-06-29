import type {
  PromMatrixData,
  PromMatrixItem,
  PromSuccessResponse,
} from "../model/index.js";
import {
  applyDuplicateValue,
  type DuplicateValue,
  type DuplicateValueStrategy,
} from "./duplicate.js";
import { safeParseFloat, toMilliseconds } from "./numeric.js";

export type TimeSeriesPoint = [timestampMs: number, value: number];

export type MatrixLabelMapOptions<
  TStrategy extends DuplicateValueStrategy = "last",
> = {
  duplicate?: TStrategy;
};

export const mapMatrixItemToSeries = (
  item: PromMatrixItem,
  parser: (value: string) => number = (value) => safeParseFloat(value),
): TimeSeriesPoint[] => {
  const points: TimeSeriesPoint[] = [];
  for (const [timestamp, rawValue] of item.values) {
    const value = parser(rawValue);
    if (!Number.isNaN(value)) {
      points.push([toMilliseconds(timestamp), value]);
    }
  }
  return points;
};

export const mapMatrixToSeries = (
  response: PromSuccessResponse<PromMatrixData>,
  parser?: (value: string) => number,
  filter?: (item: PromMatrixItem) => boolean,
): TimeSeriesPoint[] => {
  const points = response.data.result.flatMap((item) => {
    if (filter && !filter(item)) {
      return [];
    }
    return mapMatrixItemToSeries(item, parser);
  });
  return points.sort((a, b) => a[0] - b[0]);
};

export const mapMatrixByLabel = <
  TStrategy extends DuplicateValueStrategy = "last",
>(
  response: PromSuccessResponse<PromMatrixData>,
  labelName: string,
  parser?: (value: string) => number,
  options: MatrixLabelMapOptions<TStrategy> = {},
): Record<string, DuplicateValue<TimeSeriesPoint[], TStrategy>> => {
  const duplicate = options.duplicate ?? "last";
  const result: Record<string, TimeSeriesPoint[] | TimeSeriesPoint[][]> = {};

  for (const item of response.data.result) {
    const labelValue = item.metric[labelName];
    if (labelValue === undefined) {
      continue;
    }

    const series = mapMatrixItemToSeries(item, parser);
    result[labelValue] = applyDuplicateValue<TimeSeriesPoint[]>(
      result[labelValue],
      series,
      duplicate,
      labelValue,
    ) as TimeSeriesPoint[] | TimeSeriesPoint[][];
  }

  return result as Record<string, DuplicateValue<TimeSeriesPoint[], TStrategy>>;
};
