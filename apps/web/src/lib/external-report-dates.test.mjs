import assert from "node:assert/strict";
import { test } from "node:test";

test("builds the last seven report dates in Vietnam time", async () => {
  const { getDefaultExternalReportRange } =
    await import("./external-report-dates.ts");

  assert.deepEqual(
    getDefaultExternalReportRange(new Date("2026-10-25T17:00:00.000Z")),
    { from: "2026-10-20", to: "2026-10-26" },
  );
});

test("lists inclusive calendar dates across leap day", async () => {
  const { listExternalReportDates } =
    await import("./external-report-dates.ts");

  assert.deepEqual(listExternalReportDates("2024-02-28", "2024-03-01"), [
    "2024-02-28",
    "2024-02-29",
    "2024-03-01",
  ]);
});

test("rejects reversed and overlong ranges", async () => {
  const { listExternalReportDates } =
    await import("./external-report-dates.ts");

  assert.equal(listExternalReportDates("2026-10-27", "2026-10-26"), null);
  assert.equal(listExternalReportDates("2026-01-01", "2026-02-01"), null);
});
