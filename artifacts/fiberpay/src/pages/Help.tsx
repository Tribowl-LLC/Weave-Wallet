import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";

// In-app condensed version of docs/testing-guide.md. The full doc lives
// in the repo for engineers; this surface is for the person holding the
// phone, who needs a checklist they can tick through one step at a time.
//
// We deliberately do NOT render markdown dynamically — that would add a
// runtime dep + bundle weight for one screen. The content is hand-curated
// to match the markdown one-for-one; update both when the testing
// procedure changes.

interface Step {
  title: string;
  body: string;
  done: string;
}

const STEPS: Step[] = [
  {
    title: "1. Run your Fiber node",
    body: "Start your node with Docker Compose, confirm the healthcheck reports Up (healthy), and watch the logs until you see at least one peer connection.",
    done: "docker compose ps shows Up (healthy).",
  },
  {
    title: "2. Fund the node and open channels",
    body: "Deposit CKB to your node's address, wait for confirmations, then open at least one channel per asset (RUSD/USDI) you plan to spend.",
    done: "fnn-cli channel list shows at least one channel in state: active with non-zero local_balance.",
  },
  {
    title: "3. Connect this wallet",
    body: "Settings → Mode: Real node. Enter your RPC URL and auth token, tap Test connection, then Save.",
    done: "The status dot on Home is green and the balance card shows your real channel capacity.",
  },
  {
    title: "4. Pay a real Lightning invoice",
    body: "On another device, generate a small ($0.50–$2.00) bolt11 invoice — Phoenix, Muun, LND, Strike, Cash App, or any Lightning-capable merchant terminal (e.g. Square). Tap Scan to Pay, frame the QR, authenticate with your passkey, and watch the status panel cycle through Fiber → Lightning.",
    done: "WeaveWallet shows \"Fiber payment sent\" AND the receiving wallet shows the incoming payment settled.",
  },
  {
    title: "5. Verify both legs independently",
    body: "Don't just trust this screen — confirm the Fiber leg with fnn-cli payment list and the Lightning leg in the receiving wallet's history. The payment hashes must match.",
    done: "Both sides report settled AND the payment hashes match.",
  },
];

const FAILURE_CASES = [
  { label: "Low channel liquidity", expect: "Not enough balance for this payment — entry marked failed, balance unchanged." },
  { label: "Node offline mid-payment", expect: "Can't reach your Fiber node — entry failed, no partial state." },
  { label: "Bridge has no LN inbound liquidity", expect: "Your node couldn't find a route — entry failed, balance unchanged." },
  { label: "Lightning leg pending", expect: "Success screen with a yellow 'Lightning leg pending' strip. Re-check resolves it." },
  { label: "Passkey cancelled", expect: "Biometric prompt was cancelled toast. No payment attempted." },
  { label: "Phone offline", expect: "Orange offline banner at the top, payment attempts blocked." },
  { label: "Non-Lightning QR", expect: "That doesn't look like a valid Lightning invoice — no charge." },
  { label: "Expired invoice", expect: "Friendly error from the node, no partial state." },
];

export default function Help() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen flex flex-col p-6 bg-background"
    >
      <header className="flex items-center gap-3 mb-6 mt-4">
        <Link
          href="/home"
          aria-label="Back to home"
          className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Real-world testing</h1>
          <p className="text-xs text-muted-foreground mt-0.5">A checklist for your first end-to-end payment</p>
        </div>
      </header>

      <div className="bg-amber-400/10 border border-amber-400/30 rounded-2xl p-4 mb-6 flex gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold text-amber-400 block mb-1">Test on testnet first.</span>
          Both Fiber and Lightning have testnet equivalents. Run through this entire
          guide end-to-end on testnet before sending a single real cent.
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">The happy path</h2>
        <ol className="space-y-3">
          {STEPS.map((step) => (
            <li key={step.title} className="bg-card/50 border border-border/50 rounded-2xl p-4">
              <h3 className="font-semibold text-sm text-foreground mb-1">{step.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>
              <div className="flex items-start gap-2 mt-3 pt-3 border-t border-border/40">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">Done when: </span>
                  {step.done}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Failure cases to test</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Knowing how the wallet behaves when things go wrong is more important than
          knowing it works when they don't. Trigger each of these deliberately and
          verify the expected message appears.
        </p>
        <ul className="space-y-2">
          {FAILURE_CASES.map((c) => (
            <li key={c.label} className="bg-card/30 border border-border/30 rounded-xl p-3">
              <div className="text-xs font-semibold text-foreground mb-0.5">{c.label}</div>
              <div className="text-xs text-muted-foreground">{c.expect}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Ready for production?</h2>
        <div className="bg-card/30 border border-border/30 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-3">All of the following must be true:</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>· 20+ consecutive happy-path payments with no manual recheck needed</li>
            <li>· Every failure case above produces the documented friendly error</li>
            <li>· No payment has ever ended in <span className="text-foreground">unknown</span> Lightning state for &gt;10 minutes</li>
            <li>· No balance debited without either a <span className="text-foreground">settled</span> or a documented refund</li>
            <li>· Node has been running with no restart for &gt;7 days</li>
            <li>· You've paid a real merchant at least three times</li>
          </ul>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">More documentation</h2>
        <div className="bg-card/30 border border-border/30 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            The full guides live in this project's repo under
            <span className="font-mono text-foreground"> artifacts/fiberpay/docs/</span>:
          </p>
          <ul className="text-xs text-muted-foreground mt-2 space-y-1">
            <li>· <span className="font-mono text-foreground">testing-guide.md</span> — every step, command, and edge case</li>
            <li>· <span className="font-mono text-foreground">fiber-node-setup.md</span> — Docker Compose template + troubleshooting table</li>
            <li>· <span className="font-mono text-foreground">lightning-fulfillment.md</span> — how the two-leg payment works and what your node must guarantee</li>
          </ul>
        </div>
      </section>
    </motion.div>
  );
}
