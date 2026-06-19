export type UserRole =
  | 'ADMIN'
  | 'EMPLOYEE'
  | 'FRANCHISE_OWNER'
  | 'FRANCHISE_USER'
  | 'ENGINEER';

// Franchise partners are responsible for lead generation and conversion only.
// All post-conversion work (quotations, projects, service, AMC, marketing) is
// handled exclusively by company employees.
const PERMS = {
  // Leads — franchise sees/works only their own; employees see team; admin sees all
  'leads.read.all':    ['ADMIN'] as UserRole[],
  'leads.read.team':   ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'leads.read.own':    ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER'] as UserRole[],
  'leads.write':       ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER'] as UserRole[],
  'leads.assign':      ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'leads.bulk':        ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'leads.export':      ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER'] as UserRole[],
  'leads.dial.force':  ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'leads.tag':         ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER'] as UserRole[],
  'leads.merge':       ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'leads.summarize':   ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER'] as UserRole[],

  'saved_views.read':  ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER'] as UserRole[],
  'saved_views.write': ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER'] as UserRole[],

  // Voice agent — admin + employee QA only
  'voice_agent.read':          ['ADMIN'] as UserRole[],
  'voice_agent.configure':     ['ADMIN'] as UserRole[],
  'voice_agent.prompts.write': ['ADMIN'] as UserRole[],
  'voice_agent.qa':            ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'calls.read':                ['ADMIN', 'EMPLOYEE'] as UserRole[],

  // Appointments — company manages site visits; franchise not involved
  'appointments.read':   ['ADMIN', 'EMPLOYEE', 'ENGINEER'] as UserRole[],
  'appointments.write':  ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'appointments.assign': ['ADMIN', 'EMPLOYEE'] as UserRole[],

  // Teams — admin manages; employees read-only
  'teams.read':           ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'teams.write':          ['ADMIN'] as UserRole[],
  'teams.members.write':  ['ADMIN'] as UserRole[],
  'routing_rules.read':   ['ADMIN'] as UserRole[],
  'routing_rules.write':  ['ADMIN'] as UserRole[],

  // Franchise management — admin only
  'franchise.read':         ['ADMIN'] as UserRole[],
  'franchise.write':        ['ADMIN'] as UserRole[],
  'franchise.suspend':      ['ADMIN'] as UserRole[],
  'franchise.terminate':    ['ADMIN'] as UserRole[],
  'franchise.broadcast':    ['ADMIN'] as UserRole[],
  'franchise.agents.read':  ['ADMIN', 'FRANCHISE_OWNER'] as UserRole[],
  'franchise.agents.write': ['ADMIN'] as UserRole[],
  'franchise.leaderboard':  ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER'] as UserRole[],

  // Commissions & payouts — admin sees all; franchise_owner sees own only
  'commissions.read':    ['ADMIN', 'FRANCHISE_OWNER'] as UserRole[],
  'commissions.approve': ['ADMIN'] as UserRole[],
  'payouts.read':        ['ADMIN', 'FRANCHISE_OWNER'] as UserRole[],
  'payouts.write':       ['ADMIN'] as UserRole[],

  // Quotations — company employees only; franchise does not send quotes
  'quotations.read':  ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'quotations.write': ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'quotations.send':  ['ADMIN', 'EMPLOYEE'] as UserRole[],

  // Service tickets — company manages; franchise not involved
  'tickets.read':  ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'tickets.write': ['ADMIN', 'EMPLOYEE'] as UserRole[],

  // Knowledge base — everyone reads; only admin writes
  'kb.read':  ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER', 'ENGINEER'] as UserRole[],
  'kb.write': ['ADMIN'] as UserRole[],

  // Referrals — franchise brings referrals; everyone can read/write
  'referrals.read':   ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER'] as UserRole[],
  'referrals.write':  ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER'] as UserRole[],
  'referrals.reward': ['ADMIN'] as UserRole[],

  // Leaderboard — visible to all
  'leaderboard.read': ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER'] as UserRole[],

  // Reviews — company manages; franchise not involved
  'reviews.read':  ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'reviews.write': ['ADMIN', 'EMPLOYEE'] as UserRole[],

  // Wallet — admin sees all; franchise_owner sees own earnings
  'wallet.read':  ['ADMIN', 'FRANCHISE_OWNER'] as UserRole[],
  'wallet.write': ['ADMIN'] as UserRole[],

  // Projects — company manages installations; franchise not involved
  'projects.read':  ['ADMIN', 'EMPLOYEE', 'ENGINEER'] as UserRole[],
  'projects.write': ['ADMIN', 'EMPLOYEE'] as UserRole[],

  // Broadcasts & WhatsApp — company marketing only
  'broadcasts.read':  ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'broadcasts.write': ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'whatsapp.send':    ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'sequences.read':   ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'sequences.write':  ['ADMIN'] as UserRole[],

  // Service tickets (post-installation support) — company only
  'service_tickets.read':  ['ADMIN', 'EMPLOYEE', 'ENGINEER'] as UserRole[],
  'service_tickets.write': ['ADMIN', 'EMPLOYEE'] as UserRole[],

  // Notifications — self-scoped (queries filter by userId); every authenticated role
  // can read/manage their own, including ENGINEER
  'notifications.read': ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER', 'ENGINEER'] as UserRole[],

  // Admin controls
  'admin.queues': ['ADMIN'] as UserRole[],
  'admin.users':  ['ADMIN'] as UserRole[],

  // Lead sources — admin configures; employees read
  'lead_sources.read':  ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'lead_sources.write': ['ADMIN'] as UserRole[],

  // Integrations — company manages
  'integrations.read':   ['ADMIN', 'EMPLOYEE'] as UserRole[],
  'integrations.write':  ['ADMIN'] as UserRole[],
  'integrations.verify': ['ADMIN'] as UserRole[],
  'integrations.sync':   ['ADMIN', 'EMPLOYEE'] as UserRole[],

  // Metrics — franchise sees own dashboard stats; full analytics is employee+
  'metrics.network': ['ADMIN'] as UserRole[],
  'metrics.own':     ['ADMIN', 'EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER'] as UserRole[],

  // Settings — admin only
  'settings.read':  ['ADMIN'] as UserRole[],
  'settings.write': ['ADMIN'] as UserRole[],
} as const;

export type Permission = keyof typeof PERMS;

export function can(role: UserRole, action: Permission): boolean {
  return (PERMS[action] as readonly string[]).includes(role);
}
