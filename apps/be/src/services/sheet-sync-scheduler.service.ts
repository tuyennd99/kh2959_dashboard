import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { LandDashboardService } from "./land-dashboard.service";

@Injectable()
export class SheetSyncSchedulerService {
  private readonly logger = new Logger(SheetSyncSchedulerService.name);

  constructor(private readonly dashboard: LandDashboardService) {}

  @Cron(CronExpression.EVERY_5_MINUTES, {
    name: "daily-sheet-sync",
    timeZone: "Asia/Ho_Chi_Minh",
    waitForCompletion: true,
  })
  async syncDaily(): Promise<void> {
    try {
      const result = await this.dashboard.runDailySheetSync();
      if (!result)
        this.logger.warn("Bỏ qua: đang có lượt đồng bộ Google Sheet khác");
      else if (result.status === "FAILED") {
        this.logger.error("Đồng bộ theo lịch thất bại; xem SyncLog");
      } else {
        this.logger.log("Đồng bộ Google Sheet theo lịch thành công");
      }
    } catch {
      this.logger.error("Không thể chạy đồng bộ Google Sheet theo lịch");
    }
  }
}
