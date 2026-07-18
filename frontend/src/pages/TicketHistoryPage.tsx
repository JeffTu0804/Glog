import { TicketHistoryFilter } from "../components/TicketHistoryFilter";
import { PageHeader } from "../components/ui/PageHeader";

export function TicketHistoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="工單歷史紀錄"
        subtitle="依狀態、接收部門與工單序號交叉篩選，僅顯示本飯店資料"
        accent="blue"
      />
      <TicketHistoryFilter />
    </div>
  );
}
