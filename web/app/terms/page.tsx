import type { Metadata } from "next";
import Link from "next/link";
import { Legal } from "@/components/Legal";
import { DISCLAIMER } from "@/lib/summary";

export const metadata: Metadata = { title: "Terms of Service" };

export default function Terms() {
  return (
    <Legal title="Terms of Service">
      <p>
        These terms cover your use of HOPIUM (the &quot;site&quot;), a public, read-only website that publishes machine-made
        forecasts about the short-term price direction of Bitcoin, Ether and Solana and grades them in public. By using the site you
        agree to these terms. If you do not agree, please do not use it.
      </p>
      <h2>1. What the site is</h2>
      <p>
        The site shows probabilistic forecasts produced by a statistical model, the outcome of each forecast once it is known, and
        statistics about the model&apos;s track record. It is an experiment in honest forecasting and a portfolio project. It is
        not a trading service.
      </p>
      <h2>2. Not financial advice</h2>
      <p>{DISCLAIMER}</p>
      <p>
        Nothing on the site is investment, financial, legal or tax advice, or a recommendation or offer to buy, sell or hold any
        asset. We do not know your circumstances. Past results, simulated results and backtests do not predict future results. The
        model&apos;s own testing shows it does not beat trading fees. Read the full <Link className="ink-link" href="/disclaimer">Disclaimer</Link>.
      </p>
      <h2>3. No trading, no accounts, no payments</h2>
      <ul>
        <li>The site never executes trades, holds funds, connects to your exchange account or asks for keys.</li>
        <li>There is no sign-up, login, subscription, paid tier or paid tip. Anyone offering &quot;HOPIUM signals&quot; for money is not us.</li>
        <li>The site contains no affiliate or exchange referral links.</li>
      </ul>
      <h2>4. Accuracy and availability</h2>
      <p>
        We try hard to publish correct numbers, and every forecast is stored before its outcome exists and cannot be edited. Even so,
        data sources can be wrong or late, jobs can fail, and the site can be unavailable. Skipped hours are shown as missed runs and
        are never backfilled. The site is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, express or
        implied, including fitness for a particular purpose and accuracy.
      </p>
      <h2>5. Your responsibility</h2>
      <p>
        If you make any financial decision, you make it yourself and you carry its full risk. Crypto-assets are volatile, largely
        unregulated in many countries, and you can lose all of the money you put in. Check the law where you live.
      </p>
      <h2>6. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, the operator of the site is not liable for any loss or damage, including trading
        losses, lost profits or indirect or consequential loss, arising from your use of or reliance on the site or its content. Where
        liability cannot be excluded by law, it is limited to the amount you paid to use the site, which is zero.
      </p>
      <h2>7. Acceptable use</h2>
      <p>
        You may read, share and link to the site and its receipts. Please do not overload the site with automated requests, try to
        break its security, or present its forecasts as your own paid service. The source code is published on GitHub under its own
        licence terms.
      </p>
      <h2>8. Third-party data</h2>
      <p>
        Market data comes from public sources including Binance, Deribit, Coinbase and alternative.me. Those names belong to their
        owners, who have no connection with and do not endorse this site.
      </p>
      <h2>9. Changes and contact</h2>
      <p>
        We may update these terms; the date above shows the latest version. Questions: open an issue on the project&apos;s{" "}
        <a className="ink-link" href="https://github.com/KASHITOp/HOPIUM/issues">GitHub repository</a>.
      </p>
    </Legal>
  );
}
