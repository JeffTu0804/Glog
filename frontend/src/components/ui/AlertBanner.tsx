type Variant = "error" | "success" | "warning" | "info";

const STYLES: Record<Variant, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
};

interface AlertBannerProps {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

export function AlertBanner({ variant = "error", children, className = "" }: AlertBannerProps) {
  return (
    <p className={`mb-4 rounded-xl border px-4 py-3 text-sm ${STYLES[variant]} ${className}`}>
      {children}
    </p>
  );
}
