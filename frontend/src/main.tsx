import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const root = document.getElementById("root");

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!root) {
  throw new Error("找不到 #root");
}

async function boot() {
  if (!supabaseUrl || !supabaseAnonKey) {
    root!.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a">
        <div style="max-width:520px;line-height:1.6">
          <h1 style="font-size:1.25rem;margin:0 0 8px">前端環境變數未設定</h1>
          <p style="margin:0 0 12px;color:#475569">
            缺少 <code>VITE_SUPABASE_URL</code> 或 <code>VITE_SUPABASE_ANON_KEY</code>。
            Vite 會在<strong>建置當下</strong>把變數寫進 JS，請到 Cloudflare Pages → Settings → Environment variables 設定後<strong>重新 Deploy</strong>。
          </p>
          <p style="margin:0;color:#64748b;font-size:0.875rem">
            正式環境也請一併設定 <code>VITE_API_BASE_URL=https://api.glog.work</code>
          </p>
        </div>
      </div>
    `;
    return;
  }

  const [{ BrowserRouter }, { AuthProvider }, { default: App }] =
    await Promise.all([
      import("react-router-dom"),
      import("./context/AuthContext"),
      import("./App"),
    ]);

  createRoot(root!).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}

void boot();
