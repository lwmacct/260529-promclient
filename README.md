# @lwmacct/260529-promclient

Small Prometheus-compatible HTTP API client with PromQL helpers and response transforms.

这是一个轻量 TypeScript 共享库，用于在业务项目中访问 Prometheus 兼容 HTTP API。它封装了 instant query、range query、批量查询、PromQL label selector 构造、时间步长计算，以及常见响应数据转换。

## 特性

- 调用 `/api/v1/query` 和 `/api/v1/query_range`
- 支持批量查询，可并行或串行执行
- URL 较短时使用 `GET`，超过阈值后自动切换为 `POST`
- 支持全局 headers、单次请求 headers、动态 headers 和 `AbortSignal`
- 提供 Prometheus API 响应的 TypeScript 类型
- 提供 PromQL selector / label matcher 转义工具
- 提供 vector、matrix、scalar、string 响应转换工具
- 支持 label 编码 record、字段别名、字段级 value source 和多查询字段合并
- 支持重复 label / record 字段处理策略：`last`、`first`、`array`、`error`
- 无运行时依赖

## 安装

```bash
npm install @lwmacct/260529-promclient
```

运行环境需要提供 `fetch`。如果当前环境没有全局 `fetch`，可以通过 `fetcher` 传入兼容实现。

## 快速开始

```ts
import { PromClient, getVectorItems, selector } from "@lwmacct/260529-promclient";

const client = new PromClient({
  baseUrl: "https://prometheus.example.com",
  headers: {
    Authorization: `Bearer ${process.env.PROM_TOKEN}`,
  },
});

const query = selector("up", [
  { name: "job", operator: "=", value: "api" },
]);

const response = await client.query(query);
const items = getVectorItems(response);

for (const item of items) {
  console.log(item.metric.instance, Number(item.value[1]));
}
```

## Client

### 创建客户端

```ts
import { PromClient } from "@lwmacct/260529-promclient";

const client = new PromClient({
  baseUrl: "http://localhost:9090",
});
```

可用选项：

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `baseUrl` | `string` | Prometheus 服务地址，必填 |
| `fetcher` | `typeof fetch` | 自定义 fetch 实现 |
| `headers` | `HeadersInit \| (() => HeadersInit \| Promise<HeadersInit>)` | 全局请求头，支持动态返回 |
| `maxGetUrlLength` | `number` | GET URL 最大长度，默认 `2000` |

### Instant Query

```ts
const response = await client.query("up", {
  time: new Date(),
  timeout: "10s",
  limit: 100,
});
```

`query` 返回 `PromSuccessResponse<PromInstantData>`。`PromInstantData` 可能是 `vector`、`scalar` 或 `string`。

### Range Query

```ts
const response = await client.queryRange("rate(http_requests_total[5m])", {
  start: Date.now() / 1000 - 3600,
  end: Date.now() / 1000,
  step: "1m",
  timeout: "10s",
});
```

`queryRange` 返回 `PromSuccessResponse<PromMatrixData>`。

时间参数支持：

- `Date`
- Unix 秒时间戳
- Prometheus 可接受的字符串时间

### Batch Query

```ts
const responses = await client.batch([
  { query: "up" },
  {
    type: "queryRange",
    query: "rate(http_requests_total[5m])",
    options: {
      start: Date.now() / 1000 - 3600,
      end: Date.now() / 1000,
      step: "1m",
    },
  },
]);
```

默认并行执行。需要串行执行时：

```ts
const responses = await client.batch(requests, { parallel: false });
```

## PromQL 工具

### Label Matcher

```ts
import { labelMatcher, regexLabelMatcher, selector } from "@lwmacct/260529-promclient";

labelMatcher("job", "=", "api");
// job="api"

regexLabelMatcher("instance", ["10.0.0.1:9100", "10.0.0.2:9100"]);
// instance=~"10\\.0\\.0\\.1:9100|10\\.0\\.0\\.2:9100"

selector("node_cpu_seconds_total", [
  { name: "mode", operator: "!=", value: "idle" },
  { name: "job", operator: "=", value: "node" },
]);
// node_cpu_seconds_total{mode!="idle",job="node"}
```

### 转义函数

```ts
import { escapeLabelValue, escapeRegex, regexList } from "@lwmacct/260529-promclient";
```

- `escapeLabelValue`：转义 PromQL label value 中的反斜线、双引号和换行
- `escapeRegex`：转义正则特殊字符
- `regexList`：把字符串数组转换成安全的正则 alternation

## 时间工具

```ts
import { getAdaptiveStep, serializeTime } from "@lwmacct/260529-promclient";

const step = getAdaptiveStep(24 * 60 * 60, 600);
// "5m"

const time = serializeTime(new Date());
// Unix 秒字符串
```

`getAdaptiveStep(seconds, maxPoints)` 会根据查询时间范围和最大点数，从内置 step 列表中选择合适的 Prometheus step。

内置 step 包括：

```ts
["1m", "5m", "10m", "15m", "30m", "1h", "2h", "3h", "4h", "6h", "12h", "1d"]
```

## 响应转换

Prometheus 的 sample value 是字符串。转换工具会在需要时解析为 number，并过滤 `NaN`。

### Record Schema Transform

有些指标会把表格结构编码到 labels 中，例如用某些 labels 表示 record key、field name，并用 sample value 或某个 label 表示字段值。`mapVectorToRecords` 和 `mapVectorToRecordMap` 使用 schema 直接把 vector 转成对象，不再暴露中间 field rows。

示例一：sample value 作为字段值。

```promql
demo_service_quota{tenant="acme", service="api", resource="cpu"} 4
demo_service_quota{tenant="acme", service="api", resource="memory_gb"} 16
demo_service_quota{tenant="acme", service="worker", resource="cpu"} 2
```

```ts
import {
  label,
  labels,
  mapVectorToRecords,
  numberSample,
} from "@lwmacct/260529-promclient";

type ServiceQuota = {
  key: string;
  tenant: string;
  service: string;
  cpu?: number;
  memoryGb?: number;
};

const rows = mapVectorToRecords<ServiceQuota>(response, {
  key: labels(["tenant", "service"]),
  field: label("resource"),
  base: {
    key: labels(["tenant", "service"]),
    tenant: label("tenant"),
    service: label("service"),
  },
  fields: {
    cpu: numberSample("cpu"),
    memory_gb: numberSample("memoryGb"),
  },
});
```

示例二：字段值来自 label。

```promql
demo_asset_info{asset="srv-01", field="region", value="us-east"} 1
demo_asset_info{asset="srv-01", field="owner", value="platform"} 1
demo_asset_info{asset="srv-02", field="region", value="eu-west"} 1
```

```ts
import {
  label,
  labelValue,
  mapVectorToRecordMap,
} from "@lwmacct/260529-promclient";

type AssetInfo = {
  asset: string;
  region?: string;
  owner?: string;
};

const table = mapVectorToRecordMap<AssetInfo>(response, {
  key: label("asset"),
  field: label("field"),
  base: {
    asset: label("asset"),
  },
  fields: {
    region: labelValue("region", "value"),
    owner: labelValue("owner", "value"),
  },
});
```

示例三：部分字段来自 label，部分字段来自 sample。

```ts
import {
  autoValue,
  label,
  labelValue,
  labels,
  mapVectorToRecords,
  numberSample,
} from "@lwmacct/260529-promclient";

type DiskInfo = {
  key: string;
  host: string;
  serialNumber: string;
  modelNumber?: string;
  namespace?: string;
  totalBytes?: number;
};

const disks = mapVectorToRecords<DiskInfo>(response, {
  key: labels(["host", "serial"]),
  field: label("field"),
  base: {
    key: labels(["host", "serial"]),
    host: label("host"),
    serialNumber: label("serial"),
  },
  fields: {
    model_number: labelValue("modelNumber", "value"),
    namespace: autoValue("namespace", "value"),
    total_bytes: numberSample("totalBytes"),
  },
});
```

示例四：字段来自 metric name。

```ts
import {
  label,
  mapVectorToRecordMap,
  metricName,
  numberSample,
} from "@lwmacct/260529-promclient";

type MemoryStats = {
  total?: number;
  available?: number;
};

const stats = mapVectorToRecordMap<MemoryStats>(response, {
  key: label("instance"),
  field: metricName(),
  fields: {
    node_memory_MemTotal_bytes: numberSample("total"),
    node_memory_MemAvailable_bytes: numberSample("available"),
  },
});
```

多个查询结果需要合并成同一批 records 时，可以使用 `mergeVectorRecords`。每个输入可以有独立 schema，只要 key 相同就会合并到同一个对象。

```ts
import {
  constant,
  label,
  labels,
  mergeVectorRecords,
  numberSample,
} from "@lwmacct/260529-promclient";

type PortTraffic = {
  key: string;
  switchId: string;
  ifIndex: string;
  inBps?: number;
  outBps?: number;
};

const base = {
  key: labels(["switch", "ifIndex"]),
  switchId: label("switch"),
  ifIndex: label("ifIndex"),
};

const rows = mergeVectorRecords<PortTraffic>([
  {
    response: inResponse,
    schema: {
      key: labels(["switch", "ifIndex"]),
      field: constant("inBps"),
      base,
      fields: { inBps: numberSample("inBps") },
    },
  },
  {
    response: outResponse,
    schema: {
      key: labels(["switch", "ifIndex"]),
      field: constant("outBps"),
      base,
      fields: { outBps: numberSample("outBps") },
    },
  },
]);
```

重复字段默认采用后出现的值。可以在 schema 或字段规则中配置：

```ts
const rows = mapVectorToRecords(response, {
  key: label("asset"),
  field: label("field"),
  duplicate: "first",
  fields: {
    owner: labelValue("owner", "value", { duplicate: "error" }),
  },
});
```

使用 `duplicate: "array"` 时，字段从第一个值开始就是数组：

```ts
const rows = mapVectorToRecords(response, {
  key: label("asset"),
  field: label("field"),
  duplicate: "array",
  fields: {
    owner: labelValue("owner", "value"),
  },
});
```

### Instant Response

```ts
import {
  getVectorItems,
  getScalarValue,
  getScalarNumber,
  mapVector,
  mapVectorByLabel,
} from "@lwmacct/260529-promclient";
```

常用函数：

| 函数 | 说明 |
| --- | --- |
| `getVectorItems(response)` | 从 instant response 中取出 vector items，非 vector 时返回空数组 |
| `getScalarValue(response)` | 从 scalar/string response 中取出原始字符串值 |
| `getScalarNumber(response, defaultValue?)` | 从 scalar response 中解析数字 |
| `mapVectorByLabel(response, labelName, parser?)` | 按指定 label 聚合 vector 数值 |
| `mapVector(response, mapper)` | 自定义映射 vector items |

`mapVectorByLabel` 支持第四个参数配置重复 label 的处理策略：

```ts
const values = mapVectorByLabel(response, "instance", undefined, {
  duplicate: "array",
});
```

### Range Response

```ts
import {
  mapMatrixItemToSeries,
  mapMatrixToSeries,
  mapMatrixByLabel,
} from "@lwmacct/260529-promclient";
```

常用函数：

| 函数 | 说明 |
| --- | --- |
| `mapMatrixItemToSeries(item, parser?)` | 把单条 matrix series 转为 `[timestampMs, value]` 数组 |
| `mapMatrixToSeries(response, parser?, filter?)` | 把 matrix response 展平为按时间升序排列的点数组 |
| `mapMatrixByLabel(response, labelName, parser?)` | 按指定 label 输出多条时间序列 |

`mapMatrixByLabel` 同样支持第四个参数配置重复 label 的处理策略。

示例：

```ts
const response = await client.queryRange("rate(http_requests_total[5m])", {
  start: Date.now() / 1000 - 3600,
  end: Date.now() / 1000,
  step: "1m",
});

const seriesByInstance = mapMatrixByLabel(response, "instance");
```

## 类型守卫和基础工具

```ts
import {
  hasResults,
  isMatrixData,
  isScalarData,
  isStringData,
  isSuccessResponse,
  isVectorData,
  safeParseFloat,
  toMilliseconds,
} from "@lwmacct/260529-promclient";
```

这些工具适合在业务侧处理 Prometheus 原始响应时做类型缩窄和基础转换。

## 错误处理

客户端会区分三类错误：

| 错误 | 触发条件 |
| --- | --- |
| `PromHttpError` | HTTP 状态码非 2xx |
| `PromApiError` | Prometheus API 返回 `status: "error"` |
| `PromParseError` | 响应 JSON 解析失败，或响应状态不符合预期 |

```ts
import {
  PromApiError,
  PromHttpError,
  PromParseError,
} from "@lwmacct/260529-promclient";

try {
  await client.query("up");
} catch (error) {
  if (error instanceof PromHttpError) {
    console.error(error.status, error.statusText, error.url);
  } else if (error instanceof PromApiError) {
    console.error(error.errorType, error.response.error);
  } else if (error instanceof PromParseError) {
    console.error(error.message);
  }
}
```

## 导入入口

根入口导出全部公共 API：

```ts
import {
  PromClient,
  PromHttpError,
  getAdaptiveStep,
  mapMatrixByLabel,
  selector,
} from "@lwmacct/260529-promclient";
```

如果只需要响应转换工具，也可以使用唯一保留的子路径入口：

```ts
import { mapVectorToRecords } from "@lwmacct/260529-promclient/transform";
```

旧的 `./client`、`./errors`、`./promql`、`./time`、`./types` 子路径入口已移除。

## 开发

```bash
npm install
npm test
npm run typecheck
npm run build
```

发布前至少需要通过测试、类型检查和构建。

## 发布

仓库在推送 `v*` tag 时通过 GitHub Actions 发布 npm 包和 GitHub Release asset。

```bash
npm run typecheck
npm run build
task git:tag:next
```

`task git:tag:next` 来自远程 Taskfile，会创建并推送下一个版本标签。
