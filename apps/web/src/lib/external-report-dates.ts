import { parseDate } from "@internationalized/date";

const maxReportDays = 31;
const reportTimeZone = "Asia/Ho_Chi_Minh";

export function getDefaultExternalReportRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: reportTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  const to = parseDate(`${value("year")}-${value("month")}-${value("day")}`);

  return { from: to.subtract({ days: 6 }).toString(), to: to.toString() };
}

export function listExternalReportDates(from: string, to: string) {
  const first = parseDate(from);
  const last = parseDate(to);
  if (first.compare(last) > 0) return null;

  const dates: string[] = [];
  for (
    let date = first;
    date.compare(last) <= 0;
    date = date.add({ days: 1 })
  ) {
    dates.push(date.toString());
    if (dates.length > maxReportDays) return null;
  }

  return dates;
}
