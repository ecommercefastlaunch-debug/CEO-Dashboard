import { Suspense } from "react";
import { DateRangePicker } from "@/components/date-range-picker";
import type { PageContext } from "@/lib/page-context";

/** The date control that sits in page headers. Brands are switched in the sidebar. */
export function PageControls({ ctx, showRange = true }: { ctx: PageContext; showRange?: boolean }) {
  if (!showRange) return null;
  return (
    <Suspense fallback={null}>
      <DateRangePicker from={ctx.periodDays.from} to={ctx.periodDays.to} label={ctx.periodLabel} />
    </Suspense>
  );
}
