export const UPDATED = "4 November 2026";

export function Legal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="max-w-2xl py-10 text-[14px] leading-7 [&_h2]:display [&_h2]:mt-10 [&_h2]:border-t [&_h2]:border-rule [&_h2]:pt-3 [&_h2]:text-[26px] [&_h2]:text-ink [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="display text-[52px] text-ink sm:text-[68px]">{title}</h1>
      <p className="label">last updated {UPDATED}</p>
      {children}
    </article>
  );
}
