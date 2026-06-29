import assert from "node:assert/strict";
import test from "node:test";

import {
  PromClient,
  constant,
  getAdaptiveStep,
  label,
  labelMatcher,
  labels,
  mapMatrixByLabel,
  mapVectorByLabel,
  mapVectorToRecords,
  mergeVectorRecords,
  numberSample,
  safeParseFloat,
  selector,
} from "../dist/index.js";

const vectorResponse = (result) => ({
  status: "success",
  data: {
    resultType: "vector",
    result,
  },
});

const matrixResponse = (result) => ({
  status: "success",
  data: {
    resultType: "matrix",
    result,
  },
});

test("query helpers escape label values and select metrics", () => {
  assert.equal(labelMatcher("job", "=", 'api"east'), 'job="api\\"east"');
  assert.equal(
    selector("up", [
      { name: "job", operator: "=", value: "api" },
      { name: "instance", operator: "!=", value: "localhost:9090" },
    ]),
    'up{job="api",instance!="localhost:9090"}',
  );
});

test("time helpers choose the first step that satisfies max points", () => {
  assert.equal(getAdaptiveStep(24 * 60 * 60, 600), "5m");
});

test("numeric parsing defaults to NaN for invalid values", () => {
  assert.equal(Number.isNaN(safeParseFloat("not-a-number")), true);
  assert.equal(safeParseFloat("not-a-number", 0), 0);
});

test("vector label mapping keeps empty labels and filters invalid numbers", () => {
  const response = vectorResponse([
    { metric: { job: "" }, value: [1, "5"] },
    { metric: { job: "api" }, value: [1, "3"] },
    { metric: { job: "bad" }, value: [1, "not-a-number"] },
    { metric: {}, value: [1, "7"] },
  ]);

  assert.deepEqual(mapVectorByLabel(response, "job"), {
    "": 5,
    api: 3,
  });
});

test("label mappings can collect duplicate values into arrays", () => {
  const vector = vectorResponse([
    { metric: { job: "api" }, value: [1, "1"] },
    { metric: { job: "api" }, value: [1, "2"] },
  ]);
  const matrix = matrixResponse([
    { metric: { job: "api" }, values: [[1, "1"]] },
    { metric: { job: "api" }, values: [[2, "2"]] },
  ]);

  assert.deepEqual(mapVectorByLabel(vector, "job", undefined, { duplicate: "array" }), {
    api: [1, 2],
  });
  assert.deepEqual(mapMatrixByLabel(matrix, "job", undefined, { duplicate: "array" }), {
    api: [
      [[1000, 1]],
      [[2000, 2]],
    ],
  });
});

test("record duplicate array strategy stores arrays from the first value", () => {
  const response = vectorResponse([
    { metric: { tenant: "acme", service: "api", resource: "cpu" }, value: [1, "1"] },
    { metric: { tenant: "acme", service: "api", resource: "cpu" }, value: [1, "2"] },
  ]);

  assert.deepEqual(
    mapVectorToRecords(response, {
      key: labels(["tenant", "service"]),
      field: label("resource"),
      base: {
        key: labels(["tenant", "service"]),
        tenant: label("tenant"),
        service: label("service"),
      },
      fields: {
        cpu: numberSample("cpu"),
      },
      duplicate: "array",
    }),
    [
      {
        key: "acme\u0000api",
        tenant: "acme",
        service: "api",
        cpu: [1, 2],
      },
    ],
  );
});

test("record merge honors duplicate strategy", () => {
  const first = vectorResponse([
    { metric: { tenant: "acme", service: "api" }, value: [1, "1"] },
  ]);
  const second = vectorResponse([
    { metric: { tenant: "acme", service: "api" }, value: [1, "2"] },
  ]);
  const base = {
    key: labels(["tenant", "service"]),
    tenant: label("tenant"),
    service: label("service"),
  };

  assert.deepEqual(
    mergeVectorRecords(
      [
        {
          response: first,
          schema: {
            key: labels(["tenant", "service"]),
            field: constant("cpu"),
            base,
            fields: { cpu: numberSample("cpu") },
          },
        },
        {
          response: second,
          schema: {
            key: labels(["tenant", "service"]),
            field: constant("cpu"),
            base,
            fields: { cpu: numberSample("cpu") },
          },
        },
      ],
      { duplicate: "array" },
    ),
    [
      {
        key: "acme\u0000api",
        tenant: "acme",
        service: "api",
        cpu: [1, 2],
      },
    ],
  );
});

test("client switches long requests to POST and merges headers", async () => {
  let captured;
  const client = new PromClient({
    baseUrl: "https://prom.example.test/",
    maxGetUrlLength: 10,
    headers: () => ({ authorization: "Bearer root" }),
    fetcher: async (url, init) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({
          status: "success",
          data: { resultType: "vector", result: [] },
        }),
      );
    },
  });

  await client.query("up", {
    headers: {
      authorization: "Bearer request",
      "x-request-id": "abc",
    },
  });

  assert.equal(captured.url, "https://prom.example.test/api/v1/query");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.get("authorization"), "Bearer request");
  assert.equal(captured.init.headers.get("x-request-id"), "abc");
  assert.equal(
    captured.init.headers.get("content-type"),
    "application/x-www-form-urlencoded",
  );
  assert.equal(captured.init.body.get("query"), "up");
});
