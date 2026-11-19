import { useLanguage as useCopyLanguage } from "../lib/language";
import { TranslatedText } from "../lib/language";
import { LegalDocumentLayout } from "../components/LegalDocumentLayout";

export function TermsPage() {
  const { t: localizeCopy } = useCopyLanguage();
  return (
    <LegalDocumentLayout title={localizeCopy("Terms of Service")} updated="3 November 2026">
      <p> <TranslatedText text={"These Terms of Service (\"Terms\") govern your access to and use of the 2Pescrow platform, including the website, APIs, and related services (collectively, the \"Service\"). The Service is an interface to the 2Pescrow protocol. By signing in, connecting a wallet, or using the Service, you agree to these Terms."} /> </p>

      <h2><TranslatedText text={"1. What 2Pescrow provides"} /></h2>
      <p> <TranslatedText text={"2Pescrow is a peer-to-peer trade coordination tool. Buyers and sellers create shared trades, link wallets, and interact with published escrow smart contracts on supported networks. We do not hold fiat on your behalf or guarantee that any counterparty will perform. On-chain transactions are irreversible once confirmed."} /> </p>

      <h2><TranslatedText text={"2. Protocol, governance, and non-custodial design"} /></h2>
      <ul>
        <li>
          <strong><TranslatedText text={"Source-available protocol."} /></strong> <TranslatedText text={"Escrow smart contracts and related software are published for review and reuse under the project's license. The protocol is intended to be developed and directed with community governance where governance processes are published for the project."} /> </li>
        <li>
          <strong><TranslatedText text={"Non-custodial."} /></strong> <TranslatedText text={"The Service is non-custodial. We do not take custody of private keys, seed phrases, or trade deposits. Operators of the Service cannot access, withdraw, or control tokens locked in escrow smart contracts except through the same on-chain rules visible in published contract code (for example, roles or dispute resolution logic defined on-chain)."} /> </li>
        <li>
          <strong><TranslatedText text={"On-chain deposits."} /></strong> <TranslatedText text={"When you fund a trade, supported tokens are transferred from your wallet directly into escrow smart contracts on supported networks—not into omnibus wallets or bank accounts operated as custodians."} /> </li>
        <li>
          <strong><TranslatedText text={"Software, not custodial escrow."} /></strong> <TranslatedText text={"Because settlement is enforced by smart contracts and we do not take custody of user funds, the Service is offered as non-custodial coordination software—not as a traditional licensed escrow, payment, or custody service. Regulatory treatment differs by jurisdiction; you are responsible for whether your use is permitted where you are."} /> </li>
      </ul>

      <h2><TranslatedText text={"3. Regulatory status"} /></h2>
      <p> <TranslatedText text={"2Pescrow and the operators of the Service are not a bank, money transmitter, broker-dealer, or other registered or licensed financial institution, and the Service is not operated under financial-compliance registration as a regulated financial product. Nothing in these Terms is investment, tax, or legal advice."} /> </p>

      <h2><TranslatedText text={"4. Eligibility and accounts"} /></h2>
      <ul>
        <li><TranslatedText text={"You must be able to form a binding contract under the laws that apply to you."} /></li>
        <li><TranslatedText text={"Magic-link sign-in ties activity to your email account. You are responsible for securing access to that email."} /></li>
        <li><TranslatedText text={"You must provide accurate information and comply with applicable laws, including sanctions and anti–money-laundering rules."} /></li>
      </ul>

      <h2><TranslatedText text={"5. Wallets and on-chain activity"} /></h2>
      <ul>
        <li><TranslatedText text={"Connecting a wallet (including via browser extensions, Base Account, or WalletConnect) is at your own risk."} /></li>
        <li><TranslatedText text={"You authorize wallet interactions initiated through the Service, including approvals, deposits, releases, and disputes recorded on-chain where applicable."} /></li>
        <li><TranslatedText text={"Network fees, token volatility, smart-contract bugs, and chain reorganizations are your responsibility. Verify addresses and amounts before confirming."} /></li>
      </ul>

      <h2><TranslatedText text={"6. Trades between users"} /></h2>
      <p> <TranslatedText text={"Trade titles, descriptions, chat, and evidence are supplied by users. 2Pescrow is not a party to your deal unless explicitly stated. Disputes may be escalated to platform administrators when that feature is enabled; outcomes depend on the rules configured for the Service and any on-chain dispute resolution."} /> </p>

      <h2><TranslatedText text={"7. Prohibited use"} /></h2>
      <p><TranslatedText text={"You agree not to use the Service for unlawful activity, fraud, market manipulation, infringement, harassment, malware, or attempts to compromise the Service or other users' wallets."} /></p>

      <h2><TranslatedText text={"8. Referrals and fees"} /></h2>
      <p> <TranslatedText text={"Referral programs, protocol fees, and creation fees—where shown in the app or on-chain—may change. Continued use after changes constitutes acceptance of updated fee disclosures presented in the Service."} /> </p>

      <h2><TranslatedText text={"9. Disclaimers"} /></h2>
      <p> <TranslatedText text={"THE SERVICE IS PROVIDED \"AS IS\" AND \"AS AVAILABLE\" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT UNINTERRUPTED OR ERROR-FREE OPERATION."} /> </p>

      <h2><TranslatedText text={"10. Limitation of liability"} /></h2>
      <p> <TranslatedText text={"TO THE MAXIMUM EXTENT PERMITTED BY LAW, 2PESCROW AND ITS OPERATORS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOSS OF FUNDS, DATA, PROFITS, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE OR ANY ON-CHAIN TRANSACTION."} /> </p>

      <h2><TranslatedText text={"11. International access"} /></h2>
      <p> <TranslatedText text={"The Service may be accessed from many countries. We do not represent that the Service is appropriate or lawful everywhere. You must not use the Service where prohibited by applicable law. If local rules conflict with these Terms, you must stop using the Service or comply with the stricter requirement that applies to you."} /> </p>

      <h2><TranslatedText text={"12. Changes"} /></h2>
      <p> <TranslatedText text={"We may update these Terms. Material changes will be reflected by updating the date above. Your continued use after changes take effect constitutes acceptance."} /> </p>

      <h2><TranslatedText text={"13. Contact"} /></h2>
      <p> <TranslatedText text={"Questions about these Terms may be submitted through the in-app Feedback feature when enabled, or via the contact method published on the Service."} /> </p>
    </LegalDocumentLayout>
  );
}
