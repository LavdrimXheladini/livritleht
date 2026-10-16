import type { LegalText } from '../types';

// DRAFT — not yet checked by a lawyer (COMPLIANCE §9; COMPLIANCE-TODO: §14 for retention periods,
// transfers and the authority). Describes what the website and the app do today; parts that are not
// built yet (payments, live tracking, reviews) say so.
export const privacy: LegalText = {
  intro:
    'This policy explains what personal data MoversHub keeps about customers and movers, why, who else sees it, how long it is kept, and how you use your rights. It applies to the MoversHub website and the MoversHub app.',
  sections: [
    {
      id: 'who',
      heading: 'Who is responsible',
      blocks: [
        'The controller of your data is {{legalName}}, {{address}} ("MoversHub"). You can reach us at {{email}} about anything in this policy.',
        'MoversHub is a booking platform. The movers on MoversHub are independent businesses: when you book a move, the mover you choose also receives the details they need for it and is responsible for how they use them.',
      ],
    },
    {
      id: 'what',
      heading: 'What we keep',
      blocks: [
        'For everyone with an account:',
        {
          list: [
            'Your email address, your password (stored only as a one-way hash, never readable), whether you use MoversHub as a customer or a mover, and your language.',
            'When you sign in and when a code was sent to you (kept by our sign-in provider for security).',
          ],
        },
        'For customers:',
        {
          list: [
            'Your moves: the pickup and drop-off addresses with floor, lift and directions, what you move, the day and time, the van size and crew, the mover you chose and the prices you were shown.',
            'Requests you saved but did not book.',
          ],
        },
        'For movers (also required by EU law for traders on online platforms and for tax reporting):',
        {
          list: [
            'Your company: legal name, whether you are a business or a private person, registration and tax numbers, tax residence, address, contact phone and email, and the date you confirmed you offer only legal services.',
            'That your phone number was confirmed with a code, and the answers of the official company registers we checked your numbers in (EU VIES, the Polish White List, the Swiss UID register).',
            'Your documents — register extract or ID, insurance, CMR insurance, operator licence — with their end dates, in private storage.',
            'Your vans, your prices, your work areas and your cancellation terms.',
            'Our checks of your setup, any decision about your account, your appeals and complaints, and our answers.',
            'Reminders about documents that are about to end.',
          ],
        },
        'Payments (once card payments start): our payment provider Stripe handles your card and, for movers, your identity check and bank account. We never see or keep card numbers or bank details — only Stripe\'s reference numbers and whether a payment went through.',
        'Location (once live tracking starts): a mover\'s location only during an active job — from "on the way to pickup" until the move is completed or cancelled. It is sent live to the customer, and a point about every 60 seconds is kept as evidence in case of a dispute. Never when the mover is offline, between jobs or when the app is idle.',
        'Technical data: to stop abuse we count requests per network address or account; the address is stored only as a one-way code and deleted after a day.',
        'If you joined the launch list on the website: your email address and language, to tell you when MoversHub opens where you live.',
      ],
    },
    {
      id: 'why',
      heading: 'Why we use it',
      blocks: [
        {
          list: [
            'To provide the platform you signed up for — your account, quotes from movers, bookings, and showing each side what the other needs (GDPR Art. 6(1)(b), contract).',
            'Because the law requires it — checking and keeping movers\' business details (Digital Services Act, Art. 30), reporting movers\' earnings to the tax authority (DAC7), and keeping accounting records (Art. 6(1)(c), legal obligation).',
            'To keep MoversHub safe and fair — limits against abuse, fraud prevention, evidence in disputes, and security logs (Art. 6(1)(f), legitimate interests).',
            'With your consent — the launch email, and analytics if we ever add them (only after you agree; you can withdraw at any time) (Art. 6(1)(a)).',
          ],
        },
        'We do not sell your data, and we do not use it for anything unrelated to the platform without asking you.',
      ],
    },
    {
      id: 'who-sees',
      heading: 'Who else sees it',
      blocks: [
        {
          list: [
            'The mover you book sees your name, the details of the move and the exact addresses. Before a mover accepts a job, they see only the area of the pickup, never the exact address.',
            'Customers see the mover\'s business details before booking: name, business or private person, registration number, address, phone, email, insurance and terms.',
            'Our service providers, who process data only on our instructions: Supabase (database, sign-in and file storage — in the EU, Ireland), the map services we use to find addresses and routes (based on OpenStreetMap: Photon by Komoot for address search, OSRM for routes, OpenFreeMap for map images — they receive the text you search for and the points of a route, not your account), and, once in use, Twilio (codes to confirm a phone number by SMS or WhatsApp), Vercel (website hosting, EU region), Expo (app updates and notifications) and Sentry (error reports).',
            'Stripe, for payments and movers\' payouts — partly as an independent controller for its own identity checks.',
            'Tax authorities: each year MoversHub reports movers\' names, addresses, tax numbers, payouts, fees and number of jobs to {{taxAuthority}}, which shares them with the countries where movers are tax resident (DAC7).',
            'Authorities and courts when the law requires us to.',
          ],
        },
        'Some providers may process data outside the EU (for example Stripe and Twilio in the United States). Where they do, they are bound by the EU\'s standard contractual clauses or an equivalent safeguard.',
      ],
    },
    {
      id: 'how-long',
      heading: 'How long we keep it',
      blocks: [
        'Only as long as it is needed for the reason it was collected. The exact period for each kind of data will be listed here before MoversHub opens. Already decided:',
        {
          list: [
            'An account whose email code was never entered is deleted 7 days after the last code was sent.',
            'Request counters are deleted a day later.',
            'Location points, photos of a move and other evidence are deleted after a set period, unless a dispute or claim about that move is still open.',
            'Tax and accounting records are kept for as long as the law requires, even after an account is deleted.',
          ],
        },
      ],
    },
    {
      id: 'rights',
      heading: 'Your rights',
      blocks: [
        'You can:',
        {
          list: [
            'get a copy of your data — "Download my data" under "Your account" in the app or on the website gives you everything we keep about your account as a file;',
            'delete your account — "Delete my account" in the same place (records the law makes us keep, such as booked moves and tax records, stay until they may be removed);',
            'correct your data — most of it directly in the app, or write to us;',
            'object to a use based on our legitimate interests, ask us to restrict a use, and withdraw a consent at any time;',
            'complain to a data protection authority — where you live or work, or {{dataProtectionAuthority}}.',
          ],
        },
        'Write to {{email}} for anything you cannot do in the app. We answer within one month.',
      ],
    },
    {
      id: 'decisions',
      heading: 'Decisions about you',
      blocks: [
        'MoversHub makes no decision with legal or similarly significant effects about you by automated means alone. The order of movers in a quote is set by each mover\'s own price; a suspension or the end of a mover\'s account is always decided by a person, with reasons, and can be appealed.',
      ],
    },
    {
      id: 'cookies',
      heading: 'Cookies and storage on your device',
      blocks: [
        'The website uses only the cookies it needs to work: the ones that keep you signed in, and one that remembers for a day that you still have to choose a password. No advertising cookies, and no analytics cookies. If we ever add analytics, they stay off until you agree.',
        'The app keeps on your phone: your sign-in, the side you last used, your language, a password you still have to choose, and a move you started booking.',
      ],
    },
    {
      id: 'security',
      heading: 'Security',
      blocks: [
        'Data travels encrypted. Movers\' documents are kept in private, encrypted storage that only the mover and MoversHub\'s checks can open. Access inside MoversHub is limited by role. If a breach puts your data at risk, we follow a documented procedure and tell you and the authority as the law requires.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      blocks: ['When we change this policy, we change the date above and, for changes that matter to you, tell you in the app or by email before they apply.'],
    },
    { id: 'see', heading: 'See also', blocks: [{ see: 'terms' }, { see: 'mover-terms' }, { see: 'contact' }] },
  ],
};
