import "reflect-metadata";
import { validate } from "class-validator";
import { ExternalReportQueryDto } from "./land.dto";

describe("ExternalReportQueryDto", () => {
  it("rejects an impossible ISO report date", async () => {
    const query = Object.assign(new ExternalReportQueryDto(), {
      date: "2026-02-30",
    });

    const errors = await validate(query);

    expect(errors.some((error) => error.property === "date")).toBe(true);
  });
});
