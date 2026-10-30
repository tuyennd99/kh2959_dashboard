import { Logger } from "@nestjs/common";
import type { LandDashboardService } from "./land-dashboard.service";
import { SheetSyncSchedulerService } from "./sheet-sync-scheduler.service";

describe("SheetSyncSchedulerService", () => {
  it("runs daily at 02:00 Vietnam time without overlapping in one instance", () => {
    expect(
      Reflect.getMetadata(
        "SCHEDULE_CRON_OPTIONS",
        SheetSyncSchedulerService.prototype.syncDaily,
      ),
    ).toMatchObject({
      cronTime: "0 2 * * *",
      timeZone: "Asia/Ho_Chi_Minh",
      waitForCompletion: true,
    });
  });

  it("calls the dashboard once and logs lock skips and failed runs", async () => {
    const dashboard = {
      runDailySheetSync: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: "FAILED" })
        .mockRejectedValueOnce(new Error("database unavailable")),
    };
    const loggerWarn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const loggerError = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const scheduler = new SheetSyncSchedulerService(
      dashboard as unknown as LandDashboardService,
    );

    try {
      await scheduler.syncDaily();
      await scheduler.syncDaily();
      await scheduler.syncDaily();

      expect(dashboard.runDailySheetSync).toHaveBeenCalledTimes(3);
      expect(loggerWarn).toHaveBeenCalledWith(
        "Bỏ qua: đang có lượt đồng bộ Google Sheet khác",
      );
      expect(loggerError).toHaveBeenCalledTimes(2);
    } finally {
      loggerWarn.mockRestore();
      loggerError.mockRestore();
    }
  });

  it("logs when both Sheet groups finish successfully", async () => {
    const dashboard = {
      runDailySheetSync: jest.fn().mockResolvedValue({ status: "SUCCESS" }),
    };
    const loggerLog = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    const scheduler = new SheetSyncSchedulerService(
      dashboard as unknown as LandDashboardService,
    );

    try {
      await scheduler.syncDaily();
      expect(dashboard.runDailySheetSync).toHaveBeenCalledTimes(1);
      expect(loggerLog).toHaveBeenCalledWith(
        "Đồng bộ Google Sheet hằng ngày thành công",
      );
    } finally {
      loggerLog.mockRestore();
    }
  });
});
