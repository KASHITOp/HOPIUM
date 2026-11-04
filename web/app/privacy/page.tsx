import type { Metadata } from "next";
import { Legal } from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function Privacy() {
  return (
    <Legal title="Privacy Policy">
      <p>
        Short version: HOPIUM has no accounts, no sign-up, no email capture, no advertising and no tracking cookies. We collect only
        anonymous, aggregated page-view statistics.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Page-view analytics.</strong> We use Vercel Web Analytics, which counts page views without cookies and without
          building a profile of you. It records the page visited, the referring site, a rough country, and browser, operating system
          and device type. Visitors are counted with a hash that changes daily, so you cannot be followed from one day to the next.
        </li>
        <li>
          <strong>Server logs.</strong> Our host (Vercel) keeps short-lived technical logs, which can include IP addresses, to run
          and protect the service.
        </li>
      </ul>
      <h2>What we do not collect</h2>
      <ul>
        <li>No names, email addresses, phone numbers, wallet addresses or exchange keys.</li>
        <li>No cookies for tracking or advertising, and no third-party ad or social pixels.</li>
        <li>No data is sold or shared for marketing.</li>
      </ul>
      <h2>Things your browser connects to</h2>
      <p>
        To show live prices, your browser opens a connection to a public market-data stream (Binance&apos;s data-stream.binance.vision,
        or Coinbase&apos;s public feed as a fallback). Fonts load from Google Fonts. Forecast data loads from our database host,
        Supabase. Those providers see your IP address as part of a normal web request and handle it under their own privacy policies.
      </p>
      <h2>Your choices and rights</h2>
      <p>
        You can block analytics with any content blocker and the site will keep working. Because we do not hold personal data about
        identifiable visitors, there is usually nothing to access or delete, but you can ask through the project&apos;s{" "}
        <a className="ink-link" href="https://github.com/KASHITOp/HOPIUM/issues">GitHub repository</a>. If you are in the EU, UK or
        India you also have the rights given by the GDPR, UK GDPR or the Digital Personal Data Protection Act, 2023.
      </p>
      <h2>Changes</h2>
      <p>If this policy changes, the date at the top changes with it.</p>
    </Legal>
  );
}
