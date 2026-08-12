import { Spinner } from "@/components/spinner";

// Shows instantly during route transitions (and dev route compilation) so a click
// always gives immediate feedback instead of a frozen-looking page.
export default function Loading() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Spinner className="h-6 w-6 text-wheat" />
    </div>
  );
}
