import { LegalDocumentLayout } from "../components/LegalDocumentLayout";

export function TermsPage() {
  return (
    <LegalDocumentLayout title="Terms of Service" updated="3 November 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of the 2Pescrow platform, including
        the website, APIs, and related services (collectively, the &quot;Service&quot;). The Service is an interface
        to the 2Pescrow protocol. By signing in, connecting a wallet, or using the Service, you agree to these Terms.
      </p>

      <h2>1. What 2Pescrow provides</h2>
      <p>
        2Pescrow is a peer-to-peer trade coordination tool. Buyers and sellers create shared trades, link wallets, and
        interact with published escrow smart contracts on supported networks. We do not hold fiat on your behalf or
        guarantee that any counterparty will perform. On-chain transactions are irreversible once confirmed.
      </p>

      <h2>2. Protocol, governance, and non-custodial design</h2>
      <ul>
        <li>
          <strong>Source-available protocol.</strong> Escrow smart contracts and related software are published for
          review and reuse under the project&apos;s license. The protocol is intended to be developed and directed with
          community governance where governance processes are published for the project.
        </li>
        <li>
          <strong>Non-custodial.</strong> The Service is non-custodial. We do not take custody of private keys, seed
          phrases, or trade deposits. Operators of the Service cannot access, withdraw, or control tokens locked in
          escrow smart contracts except through the same on-chain rules visible in published contract code (for example,
          roles or dispute resolution logic defined on-chain).
        </li>
        <li>
          <strong>On-chain deposits.</strong> When you fund a trade, supported tokens are transferred from your wallet
          directly into escrow smart contracts on supported networks—not
          into omnibus wallets or bank accounts operated as custodians.
        </li>
        <li>
          <strong>Software, not custodial escrow.</strong> Because settlement is enforced by smart contracts and we do
          not take custody of user funds, the Service is offered as non-custodial coordination software—not as a
          traditional licensed escrow, payment, or custody service. Regulatory treatment differs by jurisdiction; you
          are responsible for whether your use is permitted where you are.
        </li>
      </ul>

      <h2>3. Regulatory status</h2>
      <p>
        2Pescrow and the operators of the Service are not a bank, money transmitter, broker-dealer, or other
        registered or licensed financial institution, and the Service is not operated under financial-compliance
        registration as a regulated financial product. Nothing in these Terms is investment, tax, or legal advice.
      </p>

      <h2>4. Eligibility and accounts</h2>
      <ul>
        <li>You must be able to form a binding contract under the laws that apply to you.</li>
        <li>Magic-link sign-in ties activity to your email account. You are responsible for securing access to that email.</li>
        <li>You must provide accurate information and comply with applicable laws, including sanctions and anti–money-laundering rules.</li>
      </ul>

      <h2>5. Wallets and on-chain activity</h2>
      <ul>
        <li>Connecting a wallet (including via browser extensions, Base Account, or WalletConnect) is at your own risk.</li>
        <li>You authorize wallet interactions initiated through the Service, including approvals, deposits, releases, and disputes recorded on-chain where applicable.</li>
        <li>Network fees, token volatility, smart-contract bugs, and chain reorganizations are your responsibility. Verify addresses and amounts before confirming.</li>
      </ul>

      <h2>6. Trades between users</h2>
      <p>
        Trade titles, descriptions, chat, and evidence are supplied by users. 2Pescrow is not a party to your deal unless
        explicitly stated. Disputes may be escalated to platform administrators when that feature is enabled; outcomes
        depend on the rules configured for the Service and any on-chain dispute resolution.
      </p>

      <h2>7. Prohibited use</h2>
      <p>You agree not to use the Service for unlawful activity, fraud, market manipulation, infringement, harassment,
        malware, or attempts to compromise the Service or other users&apos; wallets.</p>

      <h2>8. Referrals and fees</h2>
      <p>
        Referral programs, protocol fees, and creation fees—where shown in the app or on-chain—may change. Continued use
        after changes constitutes acceptance of updated fee disclosures presented in the Service.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR
        IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT
        UNINTERRUPTED OR ERROR-FREE OPERATION.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, 2PESCROW AND ITS OPERATORS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
        SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOSS OF FUNDS, DATA, PROFITS, OR GOODWILL, ARISING FROM YOUR
        USE OF THE SERVICE OR ANY ON-CHAIN TRANSACTION.
      </p>

      <h2>11. International access</h2>
      <p>
        The Service may be accessed from many countries. We do not represent that the Service is appropriate or lawful
        everywhere. You must not use the Service where prohibited by applicable law. If local rules conflict with these
        Terms, you must stop using the Service or comply with the stricter requirement that applies to you.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update these Terms. Material changes will be reflected by updating the date above. Your continued use after
        changes take effect constitutes acceptance.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms may be submitted through the in-app Feedback feature when enabled, or via the contact
        method published on the Service.
      </p>
    </LegalDocumentLayout>
  );
}
