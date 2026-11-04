import type { Metadata } from "next";
import Link from "next/link";
import { Barcode } from "@/components/Barcode";
import { BranchIcon, EnvelopeIcon, InIcon, ReceiptIcon } from "@/components/Icons";
import { TornOutline } from "@/components/Ink";
import { Stamp } from "@/components/Stamp";

export const metadata: Metadata = {
  title: "Maker",
  description: "HOPIUM is printed by Kartavyaa Patel, 20, Surat. Builds things in public, including the parts that fail.",
};

const PARAS = [
  "I grew up around my family's diamond manufacturing business in Surat, where nothing gets priced until it gets graded. Cut, clarity, flaws, all of it, on record. HOPIUM runs on the same rule: every call is graded in public before anyone gets to have an opinion about it.",
  "In 2021 I ran an NFT company. I learned how crypto hype works from the inside: wins get screenshotted, losses get deleted, and accuracy claims nobody can check get sold to people who can't check them.",
  "Since then I've founded CRAAVR, a streetwear brand, and I'm building Sambhal, a money app for India's gig workers. I'm studying for a BBA at NMIMS and pointing all of it at finance.",
  "HOPIUM is my answer to the NFT years: a prediction engine that is not allowed to lie. Three years of market data, 39 model configurations tested and logged, a holdout locked away before the first experiment, and a database that refuses to edit history. Its honest result is on the front page: it does not beat trading fees in testing. I'd rather show you that than sell you a screenshot.",
];

const LINKS = [
  { href: "https://linkedin.com/in/kartavyaapatel", label: "LinkedIn", value: "linkedin.com/in/kartavyaapatel", Icon: InIcon },
  { href: "https://github.com/KASHITOp", label: "GitHub", value: "github.com/KASHITOp", Icon: BranchIcon },
  { href: "mailto:kartavyaa099@gmail.com", label: "Email", value: "kartavyaa099@gmail.com", Icon: EnvelopeIcon },
] as const;

export default function Maker() {
  return (
    <div className="py-10">
      <article className="relative mx-auto max-w-xl" aria-labelledby="maker-h">
        <div className="slip relative px-6 pb-12 pt-10 sm:px-10" style={{ clipPath: "url(#torn)" }}>
          <div className="flex items-baseline justify-between">
            <span className="label">HOPIUM / printed by</span>
            <span className="label">no. 001</span>
          </div>
          <div className="rule mt-2" />
          <h1 id="maker-h" className="display mt-6 text-[44px] text-ink sm:text-[58px]">Printed by Kartavyaa Patel.</h1>
          <p className="mt-3 text-[14px] text-faded">20. Surat. Builds things in public, including the parts that fail.</p>
          <div className="rule mt-6 border-dashed" />
          <div className="mt-5 space-y-5 text-[14px] leading-7 text-ink">
            {PARAS.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
          <div className="rule mt-8 border-dashed" />
          <ul className="mt-5 space-y-3 text-[13px]">
            {LINKS.map(({ href, label, value, Icon }) => (
              <li key={label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-faded"><Icon size={18} className="text-ink" /> {label}</span>
                <a className="ink-link" href={href} rel="me noopener">{value}</a>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-faded"><ReceiptIcon size={18} className="text-ink" /> Case study</span>
              <Link className="ink-link" href="/case-study">how HOPIUM was built</Link>
            </li>
          </ul>
          <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
            <Barcode id={20261104} height={30} />
            <div className="-mb-2 shrink-0">
              <StampGreen />
            </div>
          </div>
        </div>
        <TornOutline />
      </article>
    </div>
  );
}

function StampGreen() {
  return <Stamp kind="BUILT IN PUBLIC. GRADED IN PUBLIC." seed={21} size="md" />;
}
