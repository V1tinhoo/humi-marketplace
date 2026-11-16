import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/InfoPage";

export const metadata: Metadata = { title: "Help Center" };

const faqs = [
  { q: "How do sessions work?", a: "Pick a host, choose audio or video, choose 20, 30 or 60 minutes, and pick a time. At the scheduled time you'd join the session from HUMI. Live calling isn't available in the beta preview." },
  { q: "Are the hosts real?", a: "Not yet. Every profile in this preview is a fictional sample used to demonstrate the product." },
  { q: "Will I be charged?", a: "No. Checkout is a demonstration — no payment provider is connected and no card details are collected." },
  { q: "Is HUMI a dating or therapy app?", a: "No. HUMI is for friendly social conversations between adults. It isn't dating, therapy, or professional advice." },
];

export default function HelpPage() {
  return (
    <InfoPage eyebrow="Help Center" title="How can we help?" intro="Answers to common questions about HUMI. More help articles will be added before launch." placeholder={false}>
      <section>
        <h2>Frequently asked questions</h2>
        <div className="divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
          {faqs.map((f) => (
            <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
                {f.q}
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-cream text-lg leading-none ring-1 ring-line transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section id="cancellation" className="scroll-mt-28">
        <h2>Cancellation policy (draft)</h2>
        <ul>
          <li>Guests can cancel for a full refund up to 12 hours before the session.</li>
          <li>Cancellations within 12 hours may receive a 50% refund.</li>
          <li>If a host cancels or doesn&apos;t show up, the guest receives a full refund.</li>
          <li>Sessions ended early for safety reasons are reviewed case by case.</li>
        </ul>
        <p>This policy is a placeholder and will be finalised before launch.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Support channels will open with the beta launch.</p>
      </section>
    </InfoPage>
  );
}
