// PII masking for logs — never log raw email/phone (DPDP + project rule).

export function maskEmail(email?: string | null): string {
  if (!email) return '';
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user?.[0] ?? ''}***@${domain}`;
}

export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length <= 4 ? '****' : `****${digits.slice(-4)}`;
}
