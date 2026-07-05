interface FilterChipProps {
  label: string;
  active?: boolean;
  onClick: () => void;
}

export function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "glog-filter-active" : "glog-filter"}
    >
      {label}
    </button>
  );
}
