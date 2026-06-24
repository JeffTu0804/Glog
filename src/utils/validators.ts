import { AppError } from "../errors/AppError.js";

export function getParamId(params: { id?: string }, label = "ID"): string {
  if (!params.id) {
    throw new AppError(400, `缺少${label}`);
  }
  return params.id;
}

export function parseEnumValue<T extends string>(
  value: unknown,
  validValues: readonly T[],
  fieldName: string,
): T {
  if (typeof value !== "string" || !validValues.includes(value as T)) {
    throw new AppError(400, `無效的 ${fieldName} 值`);
  }
  return value as T;
}

export function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new AppError(400, `${fieldName} 必須為字串`);
  }
  return value.trim() || undefined;
}

export function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(400, `${fieldName} 為必填`);
  }
  return value.trim();
}

export function parseOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new AppError(400, `${fieldName} 必須為字串陣列`);
  }
  return value;
}
