import type {
  PromMatrixData,
  PromMatrixItem,
  PromSuccessResponse,
} from "../types";
import { safeParseFloat, toMilliseconds } from "./core";

export type TimeSeriesPoint = [timestampMs: number, value: number];

export const mapMatrixItemToSeries = (
  item: PromMatrixItem,
  parser: (value: string) => number = (value) => safeParseFloat(value),
): TimeSeriesPoint[] =>
  item.values
    .map(([timestamp, rawValue]) => {
      const value = parser(rawValue);
      return [toMilliseconds(timestamp), value] as TimeSeriesPoint;
    })
    .filter(([, value]) => !Number.isNaN(value));

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

export const mapMatrixByLabel = (
  response: PromSuccessResponse<PromMatrixData>,
  labelName: string,
  parser?: (value: string) => number,
): Record<string, TimeSeriesPoint[]> =>
  response.data.result.reduce<Record<string, TimeSeriesPoint[]>>(
    (result, item) => {
      const labelValue = item.metric[labelName];
      if (!labelValue) {
        return result;
      }
      result[labelValue] = mapMatrixItemToSeries(item, parser);
      return result;
    },
    {},
  );
