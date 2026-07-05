interface UserAvatarProps {
  name: string;
  size?: "sm" | "md";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function UserAvatar({ name, size = "md" }: UserAvatarProps) {
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-sky-400 font-semibold text-white shadow-sm`}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
