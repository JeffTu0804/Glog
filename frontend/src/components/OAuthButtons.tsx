import { Link } from "react-router-dom";
import { signInWithLine } from "../lib/auth";
import type { LoginTarget } from "../types/auth";

interface OAuthButtonsProps {
  onError: (message: string) => void;
  disabled?: boolean;
  target?: LoginTarget;
  buttonLabel?: string;
  dividerLabel?: string;
}

export function OAuthButtons({
  onError,
  disabled,
  target = "hotel",
  buttonLabel = "使用 LINE 登入",
  dividerLabel = "或",
}: OAuthButtonsProps) {
  function handleLineLogin() {
    try {
      signInWithLine(target);
    } catch (err) {
      onError(err instanceof Error ? err.message : "LINE 登入失敗");
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-slate-500">{dividerLabel}</span>
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={handleLineLogin}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06C755] py-2.5 text-sm font-medium text-white hover:bg-[#05b34c] disabled:opacity-50"
      >
        <LineIcon />
        {buttonLabel}
      </button>
    </div>
  );
}

function LineIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

export function AuthFooterLink({ mode }: { mode: "login" | "register" }) {
  if (mode === "login") {
    return (
      <p className="mt-6 text-center text-sm text-slate-500">
        還沒有帳號？{" "}
        <Link to="/register" className="font-medium text-indigo-600 hover:underline">
          註冊新飯店
        </Link>
      </p>
    );
  }

  return (
    <p className="mt-6 text-center text-sm text-slate-500">
      已有帳號？{" "}
      <Link to="/login" className="font-medium text-indigo-600 hover:underline">
        返回登入
      </Link>
    </p>
  );
}
