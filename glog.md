# CLAUDE.md - Project glog Context & Guidelines

## 📋 專案概述 (Project Overview)
`glog` 是一款專門為飯店後勤設計的微型 SaaS (Hotel Back-of-House ERP)。
我們不處理訂房與前台帳務（這是 PMS 如 Opera 的工作），我們完全主導 **BOH (Back of House)** 的世界，核心價值在於管理「員工效率、資產壽命、後勤供應鏈與客房維護成本損益」。

---

## 🛠️ 技術棧規範 (Tech Stack)
- **Backend**: Node.js + Express (TypeScript)
- **Database / ORM**: PostgreSQL (由 Supabase 提供) + Prisma ORM
- **Authentication**: Supabase Auth (使用 JWT 進行後端驗證與 Tenant 綁定)
- **Frontend**: React + Tailwind CSS (搭配 `@supabase/supabase-js` 處理認證)

---

## 🏗️ 核心架構與守則 (Core Guardrails)

### 1. 多租戶嚴格隔離 (Multi-Tenant Safety)
- 系統內所有核心資料表（`User`, `Asset`, `MaintenanceTicket`, `Inventory`, `CostLog`）都必須直接或間接關聯 `tenantId`。
- **鐵律**：任何後端 API 在進行 CRUD 操作時，必須從 Supabase JWT 解出的 Session 中提取 `tenantId` 作為過濾條件，絕對不允許發生跨租戶（跨飯店）的資料洩漏。

### 2. 業務閉環邏輯 (Closed-Loop Workflow)
工單（Ticket）系統必須落實「觸發 -> 智能調度 -> 一線執行與耗材扣除 -> 財務結案」的閉環：
- 新工單建立時，需根據工程師的狀態（`status: IDLE`）與專業標籤（`skills`）進行自動派單演算法調度。
- 工程師回報完工時，必須使用 Prisma 交易（`$transaction`）同時完成：工單狀態更新、`Inventory` 庫存扣除、以及 `CostLog` 成本結算。

### 3. Supabase Auth 整合
- Prisma 中的 `User` 資料表必須將 `supabaseUserId` 設為唯一值 (`@unique`)，用來對應 Supabase Auth 的使用者 `uuid`。

---

## 💻 常用指令 (Development Commands)

### 後端 (Backend)
- 啟動開發伺服器: `npm run dev` 或 `yarn dev`
- 編譯專案: `npm run build`

### Prisma ORM
- 根據 Schema 產生 Client: `npx prisma generate`
- 建立資料庫遷移並更新 Supabase: `npx prisma migrate dev --name <migration_name>`
- 開啟 Prisma 視覺化後台: `npx prisma studio`

### 前端 (Frontend)
- 啟動前端開發伺服器: `npm run dev`

---

## ✍️ 程式碼風格與規範 (Coding Standards)

- **語言**: 專案全面採用 TypeScript，嚴禁使用 `any`，必須定義清晰的 Interface 與 Type。
- **異步處理**: 一律使用 `async/await`，並用 `try/catch` 包裹。
- **錯誤處理**: 後端需建立統一的 Error Handling Middleware，返回格式化的 JSON 錯誤訊息（例如：`{ error: "錯誤訊息說明" }`）。
- **Prisma 實踐**: 涉及多張表異動（如結案扣庫存）時，必須使用 `prisma.$transaction` 確保資料一致性。
- **命名規範**:
  - 資料庫欄位 / 變數: 小駝峰命名 (`tenantId`, `supabaseUserId`)
  - 路由定義:  kebab-case (`/api/v1/maintenance-tickets`)