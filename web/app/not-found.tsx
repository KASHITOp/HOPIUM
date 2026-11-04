import Link from "next/link";
import { Stamp } from "@/components/Stamp";

export default function NotFound() {
  return (
    <div className="py-16">
      <Stamp kind="SAT OUT" seed={404} size="lg" />
      <h1 className="display mt-6 text-[56px] text-ink">This receipt was never printed.</h1>
      <p className="mt-3 text-ink">404. Either it never existed or you typed it in by hand. We do not backfill.</p>
      <Link href="/" className="ink-link mt-4 inline-block">Back to the counter</Link>
    </div>
  );
}
