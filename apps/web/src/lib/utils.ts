import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function optionalText(value: string): string | undefined {
  return value.trim() || undefined;
}

export function formatCategoryPath(
  parts: Array<string | null | undefined>,
): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function startCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const ENTITY_FORM_KEYS = [
  "entityName",
  "representativeName",
  "representativeTitle",
  "contactAddress",
  "provinceName",
  "phone",
  "email",
] as const;

const entityKeySet = new Set<string>(ENTITY_FORM_KEYS);

export const formLabels: Record<string, string> = {
  entityName: "Tên chủ thể",
  representativeName: "Người đại diện",
  representativeTitle: "Chức danh",
  contactAddress: "Địa chỉ liên hệ",
  provinceName: "Tỉnh/thành",
  phone: "Điện thoại",
  email: "Email",
  productName: "Tên sản phẩm",
  registrationType: "Loại đăng ký",
  sampleQuantity: "Số lượng mẫu",
  assessmentYear: "Năm đánh giá",
  declarationAccepted: "Cam kết hồ sơ",
};

const registrationTypeLabels: Record<string, string> = {
  FIRST: "Lần đầu",
  UPGRADE: "Nâng hạng",
  REASSESSMENT: "Đánh giá lại",
};

export function formatFormValue(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === "")
    return "Chưa cung cấp";
  if (
    key === "registrationType" &&
    typeof value === "string" &&
    value in registrationTypeLabels
  ) {
    return registrationTypeLabels[value];
  }
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (Array.isArray(value))
    return value.map((item) => formatFormValue(item)).join(", ");
  if (isPlainObject(value)) {
    return Object.values(value)
      .map((item) => formatFormValue(item))
      .join(" · ");
  }
  return String(value);
}

export function formatFormEntries(
  formData: Record<string, unknown> | undefined,
) {
  return Object.entries(formData ?? {}).map(([key, value]) => ({
    key,
    label: formLabels[key] ?? startCase(key),
    value: formatFormValue(value, key),
  }));
}

export function partitionFormEntries(
  formData: Record<string, unknown> | undefined,
) {
  const entries = formatFormEntries(formData);
  const groups: [typeof entries, typeof entries] = [[], []];
  for (const entry of entries)
    groups[entityKeySet.has(entry.key) ? 0 : 1].push(entry);
  return groups;
}
