import { ReceiptSkeleton } from "@/components/Receipt";

export default function Loading() {
  return (
    <div className="grid gap-6 py-10 sm:grid-cols-2 lg:grid-cols-4" aria-label="Printing">
      {[0, 1, 2, 3].map((i) => <ReceiptSkeleton key={i} />)}
    </div>
  );
}
