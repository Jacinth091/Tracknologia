// Owner-approved on 2026-10-30 (#87 decision 8). Changing this text needs a new
// owner decision. The feedback form and /privacy both render this one copy.
export function FeedbackPrivacyNotice() {
  return (
    <div className="space-y-3 leading-relaxed">
      <p>
        <strong>What we collect:</strong> the kind of feedback, your title and
        message, which page you sent it from, whether you&apos;re a customer or
        a Provider (and your Provider role), and when you sent it. We don&apos;t
        ask for your name, email, phone number or tracking codes. Please
        don&apos;t put them in your message.
      </p>
      <p>
        <strong>Who can read it:</strong> only the Tracknologia team. Other
        customers and Providers can&apos;t.
      </p>
      <p>
        <strong>How long we keep it:</strong> within 90 days we review feedback
        and remove any personal details we find, or delete it if it isn&apos;t
        useful. After that we keep it to help improve Tracknologia. Removed
        details may stay in backups for a limited time. We use a temporary coded
        key, not your IP address, to stop spam. We can&apos;t reply to every
        message.
      </p>
    </div>
  );
}
