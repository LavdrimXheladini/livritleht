import type { LegalText } from '../types';

// DRAFT — not yet checked by a lawyer (COMPLIANCE §0, §1, §4, §7, §8; COMPLIANCE-TODO: §14 for the
// withdrawal-right wording per country, VAT display, claim deadlines and the applicable law).
export const terms: LegalText = {
  intro:
    'These terms apply when you use MoversHub to find and book a mover. In short: MoversHub is the booking platform; your contract for the move is with the mover you choose.',
  sections: [
    {
      id: 'platform',
      heading: 'What MoversHub is',
      blocks: [
        'MoversHub is an online booking platform run by {{legalName}}, {{address}}. It connects customers with independent moving businesses ("movers") and shows you their offers.',
        'MoversHub does not move anything, does not own vans and does not employ the movers. Each mover is an independent business that sets its own prices and terms and carries out the move itself.',
        'Your contract for a move is with the mover you book. Your contract with MoversHub is only about using the platform, as described in these terms.',
      ],
    },
    {
      id: 'account',
      heading: 'Your account',
      blocks: [
        'You need an account to book. You must be at least 18, give true details, and keep your password to yourself. You can delete your account at any time under "Your account".',
      ],
    },
    {
      id: 'booking',
      heading: 'How booking works',
      blocks: [
        {
          list: [
            'You enter the addresses (with floor and lift), what you move, the day and time, and the crew you need.',
            'For each van size, MoversHub calculates every available mover\'s price for exactly that move — from that mover\'s own prices, never from a price list set by MoversHub — and shows you the movers, lowest price first.',
            'You pick a mover, or "Book best offer" (the lowest price). Before you book you see who the mover is — name, business or private person, registration number, address, contact and insurance — their cancellation terms, and the full price.',
            'A price you are shown is held for 15 minutes; after that it is calculated again.',
            'Once card payments start: your card is saved when you book and charged only after the move. Until then, MoversHub saves your booking request, and no money changes hands through MoversHub.',
          ],
        },
      ],
    },
    {
      id: 'prices',
      heading: 'Prices',
      blocks: [
        'The price of the move is the mover\'s price, calculated from their own rates for the distance, the work and the extras (floors without a lift, heavy items, assembly). The distance is the route between the stops when you book; traffic and detours never change it.',
        'If MoversHub charges a booking fee, it is shown separately before you book. The total you see before booking is what you pay, unless the job turns out different from what you described.',
        'If it does — more items, no lift, an extra stop — the mover can ask for a new price in the app, with the reason and a photo. Nothing extra is charged unless you approve it. If you don\'t, the mover may cancel without penalty and you pay nothing for the move.',
        'VAT: [how VAT is included and shown — to be confirmed with the lawyer and accountant].',
      ],
    },
    {
      id: 'paying',
      heading: 'Paying (once card payments start)',
      blocks: [
        'Payments go through Stripe, a licensed payment provider: it holds the payment and passes the mover\'s share to the mover. MoversHub never receives the price of your move into its own account, and never sees your card number.',
        'The invoice for the move comes from the mover. MoversHub invoices only its own booking fee, if any.',
      ],
    },
    {
      id: 'cancelling',
      heading: 'Cancelling',
      blocks: [
        'Each mover sets their own cancellation terms, shown before you book and kept with your booking: free until a number of hours before the move, and after that a share of the mover\'s price.',
        'Right of withdrawal: a move booked for a specific date is generally not covered by the 14-day right of withdrawal for online purchases, because it is a service for a specific date. [Exact wording per country — to be confirmed with the lawyer.]',
      ],
    },
    {
      id: 'your-part',
      heading: 'Your part',
      blocks: [
        {
          list: [
            'Describe the move truthfully: what you move, the floors, lifts and access.',
            'Be there, or have someone there, at pickup and drop-off.',
            'Do not hand over anything dangerous or illegal. The mover may refuse items their terms exclude.',
          ],
        },
      ],
    },
    {
      id: 'damage',
      heading: 'Damage and claims',
      blocks: [
        'The mover is responsible for your belongings during the move, as the carrier, and has liability insurance, which you see before you book. MoversHub does not cover damage itself.',
        'The mover takes photos when loading and unloading, kept with your move. If something is damaged or lost, report it in the app [within the period to be set with the lawyer]. Your claim goes to the mover and their insurer; MoversHub helps both sides reach a solution and may hold the mover\'s payout while the claim is open.',
        'MoversHub is responsible for running the platform with reasonable care. Nothing in these terms limits liability that cannot be limited by law, such as for intent, gross negligence or injury to life and health, or your rights as a consumer.',
      ],
    },
    {
      id: 'tracking',
      heading: 'Live tracking (once available)',
      blocks: [
        'During your move you can see where the mover is and when they arrive, and share a link with others. The link stops working when the move ends.',
      ],
    },
    {
      id: 'reviews',
      heading: 'Reviews (once available)',
      blocks: [
        'Only customers with a completed move can review that mover, and reviews are marked as verified. MoversHub does not remove negative reviews, except ones that break the rules (for example insults or personal data), and never writes or buys reviews.',
      ],
    },
    {
      id: 'complaints',
      heading: 'Questions and complaints',
      blocks: [
        'About the move itself, contact the mover first — their details are on your move in the app. About MoversHub, or if you can\'t agree with the mover, write to {{email}}. We answer within 14 days.',
        'Out-of-court dispute resolution: {{consumerDisputeBody}}.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to these terms',
      blocks: [
        'We may change these terms, for example when the law or the platform changes. We tell you in the app or by email before changes apply. A change never affects a move you already booked.',
      ],
    },
    {
      id: 'law',
      heading: 'Applicable law',
      blocks: [
        '[The applicable law and courts — to be set with the lawyer.] As a consumer you always keep the protection of the law of the country where you live.',
      ],
    },
    { id: 'see', heading: 'See also', blocks: [{ see: 'privacy' }, { see: 'contact' }] },
  ],
};
