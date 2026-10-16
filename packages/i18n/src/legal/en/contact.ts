import type { LegalText } from '../types';

// DRAFT — not yet checked by a lawyer: the legal notice (the operator's details), the contact for
// customers, movers and authorities (Digital Services Act Art. 11, 12, 16), and out-of-court dispute
// resolution (COMPLIANCE §8; COMPLIANCE-TODO: §14 — the operator isn't registered yet).
export const contact: LegalText = {
  intro: 'Who runs MoversHub, and how to reach us.',
  sections: [
    {
      id: 'operator',
      heading: 'Legal notice',
      blocks: [
        {
          list: [
            'Operator: {{legalName}}',
            'Address: {{address}}',
            'Registered: {{registration}}',
            'VAT number: {{vatId}}',
            'Represented by: {{representative}}',
            'Email: {{email}}',
          ],
        },
        'MoversHub is a booking platform. The moves are carried out by the independent movers on MoversHub, each named with their details on every booking.',
      ],
    },
    {
      id: 'customers',
      heading: 'Customers',
      blocks: [
        'About a move you booked, contact the mover first — their details are on your move in the app. About MoversHub, or if you can\'t agree with the mover, write to {{email}}. We answer within 14 days.',
      ],
    },
    {
      id: 'movers',
      heading: 'Movers',
      blocks: [
        'In the app, "Appeals and complaints" (at the bottom of the mover home): appeal a decision about your account, or complain about anything else. A person answers each one with reasons. Other questions: {{email}}.',
      ],
    },
    {
      id: 'report',
      heading: 'Reporting illegal content',
      blocks: [
        'If you see something on MoversHub you think is illegal — for example in a mover\'s details or a review — write to {{email}} with where it is and why you think it is illegal. We look at every report, decide with care, and tell you what we decided.',
      ],
    },
    {
      id: 'authorities',
      heading: 'Authorities',
      blocks: [
        'Point of contact for authorities and for users under the Digital Services Act: {{email}}, in English, Albanian, Polish, Serbian or German.',
      ],
    },
    {
      id: 'disputes',
      heading: 'Out-of-court dispute resolution',
      blocks: [
        {
          list: ['For consumers: {{consumerDisputeBody}}.', 'For movers (mediation under the P2B Regulation): {{moverMediators}}.'],
        },
      ],
    },
    { id: 'see', heading: 'See also', blocks: [{ see: 'privacy' }, { see: 'terms' }, { see: 'mover-terms' }] },
  ],
};
