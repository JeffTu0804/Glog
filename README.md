# glog — 飯店後勤 ERP

```
glog/
├── backend/          # Express + Prisma + PostgreSQL (Supabase)
│   ├── src/
│   ├── prisma/
│   ├── .env          # 後端環境變數（從 .env.example 複製）
│   └── package.json
├── frontend/         # React + Vite + Tailwind
│   ├── src/
│   ├── .env          # 前端環境變數（從 .env.example 複製）
│   └── package.json
├── glog.md           # 專案規範與架構說明
└── package.json      # 根目錄指令（統一啟動）
```

## 快速開始

```bash
# 安裝依賴
npm run install:all

# 設定環境變數
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# 填入 Supabase 連線資訊後執行:
npm run db:seed

# 啟動（需兩個終端機）
npm run dev:backend    # http://localhost:3000
npm run dev:frontend   # http://localhost:5173
```

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm run dev:backend` | 啟動後端 API |
| `npm run dev:frontend` | 啟動前端網頁 |
| `npm run db:seed` | 寫入測試資料 |
| `npm run prisma:migrate` | 資料庫遷移 |
| `npm run prisma:studio` | 開啟 Prisma 視覺化後台 |
