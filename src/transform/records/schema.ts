import type {
  PromInstantData,
  PromSuccessResponse,
  PromVectorItem,
} from "../../model/index.js";
import type { DuplicateValueStrategy } from "../duplicate.js";

export type PromRecordValue = unknown;

export type PromRecordValueResolver<TValue = PromRecordValue> = (
  item: PromVectorItem,
) => TValue | undefined;

export type DuplicateRecordFieldStrategy = DuplicateValueStrategy;

export type PromRecordFieldRule<TValue = PromRecordValue> = {
  field: string;
  value: PromRecordValueResolver<TValue>;
  duplicate?: DuplicateRecordFieldStrategy;
};

export type PromRecordBaseSchema<TRecord extends Record<string, unknown>> = {
  [K in keyof TRecord]?: PromRecordValueResolver<TRecord[K]>;
};

export type PromRecordSchema<TRecord extends Record<string, unknown>> = {
  key: PromRecordValueResolver<string>;
  field: PromRecordValueResolver<string>;
  base?: PromRecordBaseSchema<TRecord>;
  fields: Record<
    string,
    PromRecordFieldRule | readonly PromRecordFieldRule[]
  >;
  duplicate?: DuplicateRecordFieldStrategy;
  unknownField?: "drop" | "error";
};

export type MergeVectorRecordsInput<TRecord extends Record<string, unknown>> = {
  response: PromSuccessResponse<PromInstantData>;
  schema: PromRecordSchema<TRecord>;
};

export type MergeVectorRecordsOptions = {
  duplicate?: DuplicateRecordFieldStrategy;
};
