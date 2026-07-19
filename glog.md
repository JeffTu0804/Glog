# glog — 專案架構與開發指南

## 專案概述

`glog` 是一款專門為飯店後勤設計的微型 SaaS（Hotel Back-of-House ERP）。

我們不處理訂房與前台帳務（這是 PMS 如 Opera 的工作），完全主導 **BOH (Back of House)** 的世界。核心價值在於管理「員工效率、資產壽命、後勤供應鏈與客房維護成本損益」。

---

## 技術棧

| 層級 | 技術 |
|------|------|
| Backend | Node.js + Express (TypeScript) |
| Database / ORM | PostgreSQL (Supabase) + Prisma |
| Auth | Supabase Auth (JWT) + 自訂 LINE OAuth |
| Frontend | React + Tailwind CSS + Vite |
| 推播 | LINE Messaging API（glog 官方 LINE 助手） |

專案結構：`backend/`（API）、`frontend/`（Web UI）

---

## 系統架構總覽

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
├──────────────────────────┬──────────────────────────────────────┤
│  飯店員工端 (LINE 登入)    │  平台 Manager 端 (Gmail 登入)         │
│  hotelSupabase session   │  managerSupabase session             │
│  /dashboard, /tickets…   │  /manager, /manager/tenants…         │
└────────────┬─────────────┴──────────────────┬───────────────────┘
             │ Bearer JWT                      │ Bearer JWT
             ▼                                 ▼
┌────────────────────────────┐    ┌────────────────────────────────┐
│  /api/v1/*                 │    │  /api/platform/v1/*           │
│  authenticate middleware   │    │  platformAuth middleware      │
│  → tenantId 隔離           │    │  → 跨租戶唯讀/管理              │
└────────────┬───────────────┘    └────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  PostgreSQL (Supabase) — 多租戶 Tenant + User + 業務資料         │
└─────────────────────────────────────────────────────────────────┘
             ▲
             │ 背景排程 alertSchedulerService (60s)
             │ 工單升級 · 住客 SLA · 提醒觸發
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  LINE Messaging API — 依部門推播至 lineUserId                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 認證與 Onboarding

### 雙軌登入（Session 分離）

| 身分 | 登入方式 | Session Key | 路由前綴 |
|------|----------|-------------|----------|
| 飯店員工 | LINE OAuth | `glog-hotel-auth` | `/dashboard` … |
| 平台 Manager | Gmail OAuth | `glog-manager-auth` | `/manager` … |

兩邊使用不同的 Supabase client 實例，localStorage 互不覆蓋。

### LINE OAuth 流程

Supabase 未內建 LINE provider，改走後端自訂 OAuth：

1. 前端 → `GET /api/v1/auth/line/login`
2. LINE 授權 → `GET /api/v1/auth/line/callback`
3. 後端用 `service_role` 建立 Supabase session → 導回 `/auth/callback`
4. 前端檢查 `GET /api/v1/auth/status`
   - 已註冊 → `/dashboard`
   - 未註冊 → `/register/complete`（onboarding 表單）

### 員工 Onboarding

首次登入必須完成資料登記，才能進入系統並接收 LINE 推播。

**加入現有飯店**（一般員工）：
- 輸入飯店代碼（slug）→ 即時查詢確認
- 填寫姓名、部門·職位
- `POST /api/v1/auth/join` → 建立 User + 綁定 `lineUserId`

**建立新飯店**（管理員）：
- 填寫飯店名稱、代碼、管理員姓名
- `POST /api/v1/auth/register` → 建立 Tenant + ADMIN User + 初始資產

### 角色與部門對應

| UserRole | Department | 說明 |
|----------|------------|------|
| ADMIN | MANAGEMENT | 全權管理，可見所有部門 |
| FRONT_DESK | FRONT_DESK | 前台，可建工單/服務請求 |
| HOUSEKEEPING | HOUSEKEEPING | 房務 |
| ENGINEER | ENGINEERING | 工程，接工單 |
| FOOD_BEVERAGE | FOOD_BEVERAGE | 餐飲，處理服務請求 |

`roleToDepartment()` / `rolesForDepartment()` 定義於 `backend/src/utils/department.ts`。

---

## 多租戶隔離

**鐵律**：所有核心資料表（User、Asset、MaintenanceTicket、Inventory、CostLog 等）都關聯 `tenantId`。

後端 `authenticate` middleware 從 JWT 解出 `supabaseUserId` → 查 Prisma User → 掛載 `req.user.tenantId`。

所有 CRUD 必須透過 `withTenantScope(tenantId, where)` 過濾，禁止跨租戶存取。

---

## LINE 推播架構

統一使用 **glog 官方 LINE 助手**（LINE Messaging API），不使用 LINE Notify。

### 環境變數

```
LINE_MESSAGING_ACCESS_TOKEN=   # Messaging API Channel access token
```

### 推播條件

1. 後端已設定 token
2. 員工已完成 onboarding（User 存在）
3. 員工曾 LINE 登入 → `lineUserId` 已寫入（`syncLineUserId` 在 auth middleware 執行）

### 路由邏輯（lineMessagingService.ts）

`pushToDepartmentStaff(tenantId, department, message)`：
- 查詢同 tenant、同部門 role、且有 `lineUserId` 的 User
- ADMIN 也會收到 MANAGEMENT 相關推播
- 逐一呼叫 LINE Push API

| 事件 | 推播對象 | 觸發點 |
|------|----------|--------|
| 新工程工單 | 工程部 | ticketAlertService |
| 工單逾時未接單 | 管理層 + 前台 | ticketAlertService（背景排程） |
| 交班日誌發布 | 該部門 + ADMIN | logbookService |
| 服務請求建立 | 目標部門 | serviceRequestService |
| 住客請求建立 | 目標部門 | guestRequestService |
| 住客請求逾時 | 原部門 + 前台 | reminderService |

---

## 智慧通報（Alert System）

背景服務 `alertSchedulerService` 啟動於 server listen 後，預設每 60 秒輪詢。

### 1. 交班日誌 → 自動開工單

`logbookAlertService`：備註含房號 + 維修關鍵字 → 自動建立 MaintenanceTicket → LINE 推播工程部。

### 2. 工單逾時升級

`ticketAlertService`：工單建立後 `TICKET_ESCALATION_MINUTES`（預設 15）無人接單 → 推播管理層 + 前台。

### 3. 住客請求 SLA

住客掃 QR 提交請求 → 30 分鐘後若未結案 → 推播原負責部門 + 前台。

---

## 核心業務模組

### 工單（MaintenanceTicket）

閉環：觸發 → 智能調度 → 執行與耗材扣除 → 財務結案

- 建立時依工程師 `status: IDLE` + `skills` 自動派單
- 完工 `$transaction`：更新工單 + 扣 Inventory + 寫 CostLog
- 路由：`/api/v1/maintenance-tickets`

### 交班日誌（Logbook）

- 各部門獨立 logbook（前台、餐飲、房務、工程、管理層）
- 班別：早 07–15、中 15–23、晚 23–07（台北時間）
- 交班產生 AI 摘要（OpenAI 或規則 fallback）+ LINE 推播
- 路由：`/api/v1/logbook`

### 服務請求（ServiceRequest）

跨部門協作（例：前台 → 餐飲部餐廳預約）：
- 前台/房務建立 → 目標部門 inbox → 確認/拒絕 → 提醒排程
- 路由：`/api/v1/service-requests`

### 住客請求（GuestRequest）

- 住客掃房間 QR（`/guest/scan/:roomCode`）免登入提交
- 依請求類型路由至對應 Department
- 路由：`/api/v1/guest-requests`（員工端）、`/api/guest/*`（公開）

### 資產 / 庫存 / 成本

- Asset：房間、設備等地點
- Inventory：耗材庫存，工單結案扣減
- CostLog：維修成本紀錄
- 路由：`/api/v1/assets`、`/inventory`、`/cost-logs`

### 平台 Manager

跨租戶營運後台（Gmail 登入，與飯店 session 分離）：
- 租戶列表、訂閱狀態
- 跨租戶庫存 / 成本 / 員工總覽
- 路由：`/api/platform/v1/*`

---

## API 路由結構

```
/health
/api/guest/*                    住客公開 API（免登入）
/api/v1/auth/*                  註冊、join、status
/api/v1/auth/line/*             LINE OAuth
/api/v1/*                       飯店業務 API（需 authenticate）
/api/platform/v1/*              平台 Manager API（需 platformAuth）
```

---

## 常用指令

### 後端（`backend/`）

```bash
npm run dev              # 開發伺服器
npm run build            # TypeScript 編譯
npm run prisma:generate  # 產生 Prisma Client
npm run prisma:migrate   # 資料庫遷移
npm run prisma:studio    # 視覺化後台
npm run db:seed          # 測試資料
```

根目錄快捷：`npm run dev:backend`

### 前端（`frontend/`）

```bash
npm run dev              # Vite 開發伺服器 (5173)
npm run build            # 生產建置
```

根目錄快捷：`npm run dev:frontend`

---

## 程式碼規範

- **語言**：全面 TypeScript，避免 `any`
- **異步**：使用 `async/await` + `try/catch`
- **錯誤處理**：統一 Error Middleware，回傳 `{ error: "訊息" }`
- **交易**：多表異動必須 `prisma.$transaction`
- **命名**：欄位小駝峰（`tenantId`）、路由 kebab-case（`/maintenance-tickets`）

---

## 環境變數速查

詳細設定見 `backend/.env.example` 與 `開發SOP.ini`。

| 變數 | 用途 |
|------|------|
| DATABASE_URL / DIRECT_URL | Prisma 連線 |
| SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY | Auth |
| LINE_CHANNEL_ID / SECRET / REDIRECT_URI | LINE 登入 |
| LINE_MESSAGING_ACCESS_TOKEN | glog LINE 助手推播 |
| TICKET_ESCALATION_MINUTES | 工單升級時間 |
| ALERT_POLL_INTERVAL_MS | 背景排程間隔 |
| OPENAI_API_KEY | AI 交班摘要（選填） |
| SMTP_* | Manager 申請通知信 |

## 🛠️ 後端架構：多平台轉接器模式 (Adapter Pattern)
為了解決未來進軍國際市場（加入 WhatsApp）的考量，後端 Webhook 採用解耦設計：
1. 所有外部通訊平台的訊號，必須先經過「轉接器 (Adapter)」翻譯。
2. 統一轉換為 `GlogIncomingMessage` 標準格式後，才能交由「核心中樞 (Core Handler)」處理。

### 統一資料規格 (Interface)
```typescript
interface GlogIncomingMessage {
  platform: "line" | "whatsapp";
  userId: string;
  messageType: string;
  text: string;
  metadata?: {
    replyToken?: string;
    [key: string]: any;
  };
}