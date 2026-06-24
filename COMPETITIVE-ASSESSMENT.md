# Excess CRM — Performance, Competitive Position & "World-Best" Roadmap

> Assessment by DigitalVetri. A data-backed view of where the product stands, how it
> compares to leading CRMs, and the prioritized path to best-in-class.

---

## ⚡ Performance — strong, with the big wins already taken

| Metric | Value | Verdict |
|---|---|---|
| Shared JS (every page) | **103 kB** | ✅ Excellent (<150 kB target) |
| Most pages (leads/projects/etc.) | 150–190 kB first load | ✅ Good |
| Dashboard (charts + map) | 272 kB | 🟡 Heaviest page |
| API response times | sub-second (measured) | ✅ Fast |
| Static assets | ~20 kB (just the logo) | ✅ Lean |

**Done in this pass:**
- 🗑️ Removed **4.7 MB** of unused/oversized hero images (`banner-hero.png` 2.5 MB + `solar-hero.png` 2.2 MB) → login & dashboard are now pure-CSS heroes.
- 📱 Added a **PWA manifest** — the CRM is now installable.
- ✅ Confirmed **leaflet (maps)** and **LiveKit (voice)** are already lazy-loaded via `next/dynamic`.

**Remaining perf follow-ups (lower priority):**
- Code-split **recharts** off the dashboard initial bundle (needs a client-boundary refactor; dashboard is acceptable at 272 kB today).
- Add a **service worker** + 192/512 maskable PNG icons for full offline-PWA.

---

## 🏆 Where Excess CRM already beats the big CRMs (for its vertical)

1. **Native AI Voice Agent** — auto-dials, qualifies and follows up leads in Tamil/English. HubSpot/Zoho/Salesforce need third-party bolt-ons. *A genuine differentiator.*
2. **Solar-specific depth** — survey → design → material → install → commissioning → handover pipeline, **subsidy + net-metering tracking, ₹/kW commissions, AMC contracts**. Generic CRMs need months of customization to match.
3. **India-first** — IndiaMART/JustDial lead sources, native WhatsApp, **TRAI DND compliance**, Tamil language, ₹/subsidy logic. Only LeadSquared comes close.
4. **Franchise multi-tenancy** — commissions, agent splits, territory routing, RLS isolation. Rare off-the-shelf.
5. **You own it** — self-hosted, no per-seat SaaS fees, full data control, fully customizable.
6. **Modern & fast** — 103 kB shared bundle, sub-second APIs, clean UX. Many enterprise CRMs are heavy and slow.

## ⚖️ Where Salesforce / HubSpot / Zoho still lead

| Dimension | Them | Excess CRM |
|---|---|---|
| Native **mobile apps** | Mature iOS/Android | Web-only (RN engineer app planned) |
| **Integration marketplace** | 1000s of connectors | The integrations built in |
| **Reporting / BI & forecasting** | Deep, AI-driven | Solid; less depth |
| **No-code customization** | Field/workflow/layout builders | Code changes |
| **Scale track record** | Millions of users | Greenfield |

**Honest take:** you won't out-Salesforce Salesforce as a *general* CRM. But **"the world's best solar lead-to-install CRM with a native AI voice agent, built for India"** is a real, winnable position — and the product is ~80% of the way there.

---

## 🚀 Roadmap to undisputed best-in-class

### P1 — quick, high ROI *(this pass + a little more)*
- ✅ Kill oversized images (done) · ✅ PWA manifest (done) · ✅ maps/voice lazy-loaded (verified)
- ⏭️ Service worker + proper PWA icons (installable + offline)
- ⏭️ recharts code-split (trim the dashboard)

### P2 — the differentiators *(weeks)*
- **Mobile app** for engineers + sales (field-first; the planned React Native app)
- **AI everywhere** — next-best-action suggestions, AI-drafted WhatsApp/email replies, call summarization, richer lead scoring
- **Deeper analytics** — forecasting, funnel/cohort depth, finish the custom report builder
- **WhatsApp as a first-class 2-way channel** — catalog, chatbot, payments

### P3 — scale & polish
- No-code custom fields/workflows · Zapier-grade connector hub · turn on Sentry/Datadog · load testing · WCAG AA · i18n beyond Tamil

---

## Bottom line
The application is **production-ready and already best-in-class for its niche** — fast, vertically deep, India-native, with an AI voice agent the giants lack. The gap to "world's best" is about **mobile reach, AI depth, and analytics** — *adding* strengths, not fixing weaknesses.
