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

### Label Record Transform

有些指标会把表格结构编码到 labels 中，例如用某些 labels 表示 `index`、`key`、`field`，再用 sample value 或 `value` label 表示字段值。可以用 `mapVectorToFieldRows` 先转成标准行，再按 key 或 index/key pivot 成对象表。

示例一：sample value 作为字段值。

假设查询返回这些 vector samples：

```promql
demo_service_quota{tenant="acme", service="api", resource="cpu"} 4
demo_service_quota{tenant="acme", service="api", resource="memory_gb"} 16
demo_service_quota{tenant="acme", service="worker", resource="cpu"} 2
```

可以把它理解为：

| index | key | field | value |
| --- | --- | --- | --- |
| `acme` | `api` | `cpu` | `4` |
| `acme` | `api` | `memory_gb` | `16` |
| `acme` | `worker` | `cpu` | `2` |

```ts
import {
  mapFieldRowsByIndexKey,
  mapVectorToFieldRows,
} from "@lwmacct/260529-promclient";

const response = await client.query("demo_service_quota");

const rows = mapVectorToFieldRows(response, {
  indexLabels: ["tenant"],
  keyLabels: ["service"],
  fieldLabels: ["resource"],
  valueSource: "sample",
});

const table = mapFieldRowsByIndexKey(rows);
// {
//   acme: {
//     api: {
//       cpu: 4,
//       memory_gb: 16
//     },
//     worker: {
//       cpu: 2
//     }
//   }
// }
```

如果字段由多个 label 共同决定，可以把多个 label 组合成字段名：

```ts
const rows = mapVectorToFieldRows(response, {
  indexLabels: ["tenant"],
  keyLabels: ["service"],
  fieldLabels: ["method", "status"],
});
// method="GET", status="200" -> field: "GET.200"
```

示例二：`value` label 作为字段值。

这类指标通常用 sample value `1` 表示“这条信息存在”，真正的字段值在 label 中：

```promql
demo_asset_info{asset="srv-01", field="region", value="us-east"} 1
demo_asset_info{asset="srv-01", field="owner", value="platform"} 1
demo_asset_info{asset="srv-02", field="region", value="eu-west"} 1
```

可以把它理解为：

| key | field | value |
| --- | --- | --- |
| `srv-01` | `region` | `us-east` |
| `srv-01` | `owner` | `platform` |
| `srv-02` | `region` | `eu-west` |

```ts
import {
  mapFieldRowsByKey,
  mapVectorToFieldRows,
} from "@lwmacct/260529-promclient";

const response = await client.query("demo_asset_info");

const rows = mapVectorToFieldRows(response, {
  keyLabels: ["asset"],
  fieldLabels: ["field"],
  valueLabel: "value",
  valueSource: "auto",
});

const table = mapFieldRowsByKey(rows);
// {
//   "srv-01": {
//     region: "us-east",
//     owner: "platform"
//   },
//   "srv-02": {
//     region: "eu-west"
//   }
// }
```

`valueSource` 支持：

| 值 | 说明 |
| --- | --- |
| `"auto"` | 优先读取 `valueLabel` 指定的 label；不存在时读取 sample value，默认值 |
| `"label"` | 只读取 `valueLabel` 指定的 label |
| `"sample"` | 只读取 Prometheus sample value |

重复字段默认采用后出现的值。需要保留第一条、保留数组或发现重复时报错时，可以配置 pivot 函数：

```ts
mapFieldRowsByKey(rows, { duplicate: "first" });
mapFieldRowsByKey(rows, { duplicate: "array" });
mapFieldRowsByKey(rows, { duplicate: "error" });
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

## 子路径导入

包提供以下导出入口：

```ts
import { PromClient } from "@lwmacct/260529-promclient/client";
import { PromHttpError } from "@lwmacct/260529-promclient/errors";
import { selector } from "@lwmacct/260529-promclient/promql";
import { getAdaptiveStep } from "@lwmacct/260529-promclient/time";
import { mapMatrixByLabel } from "@lwmacct/260529-promclient/transform";
```

完整入口 `@lwmacct/260529-promclient` 会导出所有公共 API。

## 开发

```bash
npm install
npm run typecheck
npm run build
```

当前仓库没有测试脚本，发布前至少需要通过类型检查和构建。

## 发布

仓库在推送 `v*` tag 时通过 GitHub Actions 发布 npm 包和 GitHub Release asset。

```bash
npm run typecheck
npm run build
task git:tag:next
```

`task git:tag:next` 来自远程 Taskfile，会创建并推送下一个版本标签。
