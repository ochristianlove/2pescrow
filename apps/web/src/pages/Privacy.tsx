import { LegalDocumentLayout } from "../components/LegalDocumentLayout";

export function PrivacyPage() {
  return (
    <LegalDocumentLayout title="Privacy Policy" updated="3 November 2026">
      <p>
        This Privacy Policy explains how 2Pescrow (&quot;we&quot;, &quot;us&quot;) collects, uses, and shares information when you use
        our website and related services (the &quot;Service&quot;). The Service interfaces with a non-custodial protocol: we do
        not receive or store private keys or control tokens held in on-chain escrows.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li><strong>Account data:</strong> Email address and profile fields you provide for magic-link sign-in.</li>
        <li>
          <strong>Wallet data:</strong> Public wallet addresses you connect or link, chain type, and on-chain transaction
          identifiers associated with trades. We do not collect private keys, seed phrases, or wallet passwords.
        </li>
        <li><strong>Trade data:</strong> Trade titles, descriptions, statuses, messages, uploaded evidence, dispute records, and referral codes you use or create.</li>
        <li><strong>Technical data:</strong> IP address, browser type, device information, and logs needed to operate and secure the Service.</li>
        <li><strong>Communications:</strong> Feedback you submit and emails sent for authentication or notifications when enabled.</li>
      </ul>

      <h2>2. How we use information</h2>
      <ul>
        <li>Provide, maintain, and improve the Service (including trade rooms, dashboards, and admin tools).</li>
        <li>Authenticate users, prevent abuse, and enforce our Terms.</li>
        <li>Index and display on-chain escrow events tied to your trades.</li>
        <li>Send transactional messages (such as magic links) when email delivery is configured.</li>
        <li>Comply with legal obligations and respond to lawful requests.</li>
      </ul>

      <h2>3. On-chain and public data</h2>
      <p>
        Blockchain transactions are public by design. When you fund a trade, assets move directly on supported blockchains
        into smart contracts; we do not take custody of those balances in our systems. Wallet addresses, contract
        addresses, token transfers, and hashes you submit on-chain are not confidential. Trade verification links may
        expose limited trade metadata intended for confirmation by third parties.
      </p>

      <h2>4. Third-party services</h2>
      <p>
        We use infrastructure providers (hosting, databases, email) and wallet connectivity tools (such as WalletConnect,
        wallet extensions, and RPC providers). Those providers process data according to their own policies. When you
        connect a wallet, your wallet vendor may collect data independently of us.
      </p>

      <h2>5. Cookies and local storage</h2>
      <p>
        We use browser storage for session tokens, language preferences, and draft trade forms. You can clear storage in
        your browser; doing so may sign you out or remove unsaved drafts.
      </p>

      <h2>6. Retention</h2>
      <p>
        We retain account and trade records while your account is active and as needed for legal, security, and backup
        purposes. Uploaded files may be deleted according to admin retention settings.
      </p>

      <h2>7. Your choices</h2>
      <ul>
        <li>You may disconnect wallets and sign out at any time.</li>
        <li>You may request correction or deletion of account data where applicable law allows; on-chain data cannot be erased.</li>
        <li>You may disable non-essential email by not using magic-link sign-in or by contacting us where supported.</li>
      </ul>

      <h2>8. Security</h2>
      <p>
        We apply reasonable administrative and technical measures to protect data. No method of transmission or storage is
        completely secure; use strong email and wallet security practices.
      </p>

      <h2>9. International users</h2>
      <p>
        The Service may be used from many locations. If you access it from outside the country where our servers operate,
        your information may be processed in other jurisdictions with different data-protection laws. You are responsible
        for complying with privacy and other laws that apply to you locally.
      </p>

      <h2>10. Children</h2>
      <p>The Service is not directed to children under 18. We do not knowingly collect personal data from children.</p>

      <h2>11. Changes</h2>
      <p>
        We may update this Privacy Policy. The &quot;Last updated&quot; date will change when we do. Continued use after updates
        means you accept the revised policy.
      </p>

      <h2>12. Contact</h2>
      <p>
        Privacy questions may be submitted through the in-app Feedback feature when enabled, or via the contact method
        published on the Service.
      </p>
    </LegalDocumentLayout>
  );
}
