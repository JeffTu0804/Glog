import { SubscriptionStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getActiveReminders } from "./reminderService.js";
import { processDueDepartmentAcceptReminders } from "./departmentAcceptAlertService.js";
import { processDueTicketEscalations } from "./ticketAlertService.js";

const POLL_INTERVAL_MS = Number(process.env.ALERT_POLL_INTERVAL_MS ?? 60_000);

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

/** 背景輪詢：工單升級、住客請求 SLA 等到期提醒 */
export function startAlertScheduler(): void {
  if (schedulerInterval) return;

  const intervalMs =
    Number.isFinite(POLL_INTERVAL_MS) && POLL_INTERVAL_MS >= 15_000
      ? POLL_INTERVAL_MS
      : 60_000;

  const tick = async () => {
    try {
      const acceptReminders = await processDueDepartmentAcceptReminders();
      if (acceptReminders > 0) {
        console.log(`[Alert] 已處理 ${acceptReminders} 筆部門接單逾時提醒`);
      }

      const ticketEscalations = await processDueTicketEscalations();
      if (ticketEscalations > 0) {
        console.log(`[Alert] 已處理 ${ticketEscalations} 筆工單逾時升級`);
      }

      const tenants = await prisma.tenant.findMany({
        where: { subscriptionStatus: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] } },
        select: { id: true },
      });

      for (const tenant of tenants) {
        await getActiveReminders(tenant.id, UserRole.ADMIN);
      }
    } catch (err) {
      console.error("[Alert] 背景提醒處理失敗", err);
    }
  };

  void tick();
  schedulerInterval = setInterval(() => {
    void tick();
  }, intervalMs);

  console.log(`[Alert] 智慧通報排程已啟動（每 ${intervalMs / 1000}s）`);
}

export function stopAlertScheduler(): void {
  if (!schedulerInterval) return;
  clearInterval(schedulerInterval);
  schedulerInterval = null;
  console.log("[Alert] 智慧通報排程已停止");
}
