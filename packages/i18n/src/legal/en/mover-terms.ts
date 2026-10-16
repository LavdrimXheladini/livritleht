import type { LegalText } from '../types';

// DRAFT — not yet checked by a lawyer (COMPLIANCE §1, §2, §3, §5, §6, §7, §9.1, §10; P2B Regulation
// 2019/1150; COMPLIANCE-TODO: §14 for payouts outside Stripe's countries, the applicable law and the
// mediators). The ranking rules here must stay the same as the public "How ranking works" page.
export const moverTerms: LegalText = {
  intro:
    'These terms apply between MoversHub and the moving businesses that offer their services on it ("movers"). They explain what MoversHub does for you, what it costs, how customers find you, and how decisions about your account are made.',
  sections: [
    {
      id: 'relationship',
      heading: 'An independent business on a platform',
      blocks: [
        'MoversHub is an online booking platform run by {{legalName}}, {{address}}. It shows your offers to customers and handles bookings and payments.',
        'You are an independent business. You are not employed by MoversHub and MoversHub does not direct your work. You may work for other platforms and for your own customers — there is no exclusivity and no non-compete.',
        'The contract for each move is between you and the customer. You carry out the move yourself, as the carrier, under your own name.',
      ],
    },
    {
      id: 'joining',
      heading: 'Joining MoversHub',
      blocks: [
        'Before customers see you, you set up in the app, and MoversHub checks what you enter (EU law requires platforms to know the businesses on them):',
        {
          list: [
            'your company: legal name, registration and tax numbers, tax residence, address and contact, and your confirmation that you offer only legal services;',
            'documents: the company register extract (a private person: an ID document) and your carrier liability insurance; for moves across a border, your CMR insurance and, where required, the EU operator licence;',
            'your vans: size class, plate, weight, load space, tail lift and tachograph;',
            'your prices, your work areas and your cancellation terms;',
            'payouts with MoversHub\'s payment provider, Stripe (once card payments start).',
          ],
        },
        'A person at MoversHub checks your details and documents, and your company numbers in the official registers where they can be checked online. MoversHub may ask you to change something, with a note you read in the app.',
      ],
    },
    {
      id: 'prices',
      heading: 'Your prices',
      blocks: [
        'You set your own prices for each van: a base fee, a price per kilometre, per hour of work for each crew size, a minimum price and extras. You can change them at any time; new quotes use the new prices.',
        'MoversHub only calculates a customer\'s price from your prices. It never sets your prices, never caps them, never adds surge pricing to them, and never gives a discount out of your earnings without your agreement. Local average prices in the app are information only.',
        'If a job turns out different from the customer\'s description, you can ask for a new price in the app, with the reason and a photo. The customer approves or rejects it; if they reject it, you may cancel without penalty.',
      ],
    },
    {
      id: 'jobs',
      heading: 'Jobs: your choice',
      blocks: [
        {
          list: [
            'You see the job and your price before you accept, and you accept or decline each job freely. Declining never moves you down, never reduces the jobs you are offered, and never costs you anything.',
            'You choose your working hours and your work areas, and can stop taking jobs at any time. There are no minimum hours or shifts.',
            'You decide how you do the work. MoversHub requires no uniforms, branding or equipment. What the customer asked for (items, floors, time) is the customer\'s order, not an instruction from MoversHub.',
          ],
        },
      ],
    },
    {
      id: 'ranking',
      heading: 'How customers see you (ranking)',
      blocks: [
        'For a move, a customer sees every mover for whom all of this is true:',
        {
          list: [
            'MoversHub has checked your company details and documents;',
            'you have a van of the size the customer chose, and MoversHub has checked it;',
            'the pickup is inside one of your work areas;',
            'you are registered in the country of the move — across a border, in the country at one end of it;',
            'your carrier insurance is valid on the move day;',
            'across a border: your CMR insurance is valid on the move day, your prices are in euros, and heavier vans have a tachograph and a valid operator licence;',
            'you have set your own prices and cancellation terms;',
            'you have set up payouts with MoversHub\'s payment provider;',
            'your account is not suspended.',
          ],
        },
        'The order is your own price for that move, lowest first (where movers use different currencies, prices in the pickup country\'s currency come first). "Book best offer" chooses the lowest price.',
        'Nothing else changes the order: no mover can pay for a better place (if paid placement is ever offered, it will be marked for customers and explained here first); declining jobs never moves you down; where you drive during jobs is never used; and the commission is the same for every mover. Before customer reviews affect the order, these terms and the public page will say how.',
      ],
    },
    {
      id: 'fees',
      heading: 'Fees and payouts',
      blocks: [
        'MoversHub\'s commission is 20% of your price for a move within one country and 15% for a move across a border. It is kept from the customer\'s payment; you see it, and your payout, before you accept. A booking fee the customer pays, if any, goes to MoversHub and is shown to the customer separately.',
        'Payments go through Stripe, a licensed payment provider: the customer\'s card is charged after the move, and your share is paid out to you after the customer confirms the move, or automatically 48 hours after it with no dispute. MoversHub never holds the price of a move in its own account.',
        'If the customer\'s card fails, the customer is asked to pay in the app; MoversHub does not pay you from its own money. While a claim about a move is open, MoversHub may hold the payout for that move.',
        'MoversHub invoices you its commission, with VAT where it applies. You invoice the customer for the move.',
        '[Payouts in countries Stripe cannot pay out to (for example Kosovo) — the solution is still to be decided.]',
      ],
    },
    {
      id: 'duties',
      heading: 'What you take care of',
      blocks: [
        {
          list: [
            'Keep your documents valid. MoversHub reminds you 30, 14 and 3 days before one ends; without valid carrier insurance on the move day, customers don\'t see you.',
            'Offer only legal services and hold the licences your work needs.',
            'You are responsible for the customer\'s belongings during the move, as the carrier, and for your own taxes and social contributions.',
            'Take the photos at pickup and drop-off the app asks for: they protect you and the customer if something is disputed.',
          ],
        },
      ],
    },
    {
      id: 'location',
      heading: 'Your location',
      blocks: [
        'Once live tracking starts, the app shares your location with the customer only during an active job — from "on the way to pickup" until the move is completed or cancelled — and you always see when it is on. It is never used to rank, score or discipline you.',
      ],
    },
    {
      id: 'tax',
      heading: 'Tax reporting',
      blocks: [
        'EU law (DAC7) requires MoversHub to report each year, to {{taxAuthority}}, your name, address, tax number, tax residence, your payouts, the fees kept and the number of jobs, per quarter. That authority shares them with the countries where you are tax resident.',
      ],
    },
    {
      id: 'decisions',
      heading: 'Restriction, suspension and ending your account',
      blocks: [
        'MoversHub may restrict or suspend your account, or end it, only for a reason in these terms — for example missing or invalid documents, serious or repeated complaints from customers, or breaking these terms or the law.',
        {
          list: [
            'Every such decision is made by a person at MoversHub. An automatic system may only point a case out to a person.',
            'You receive the reasons in writing in the app — at the latest when the decision applies.',
            'Ending your account takes effect at least 30 days after you are told, unless it is for a serious violation (fraud, illegal activity, repeated serious breaches).',
            'You can appeal every decision in the app ("Appeals and complaints"). A person reads every appeal and answers with reasons; an upheld appeal lifts the decision.',
          ],
        },
      ],
    },
    {
      id: 'complaints',
      heading: 'Complaints',
      blocks: [
        'You can complain about anything to do with MoversHub — a job, the app, a check of your documents, a payout — under "Appeals and complaints" in the app. A person answers each complaint with reasons, as quickly as its importance and complexity allow.',
        'Mediation: if a complaint isn\'t resolved, you and MoversHub can try mediation with {{moverMediators}}. MoversHub takes part in good faith and pays a reasonable share of the cost.',
      ],
    },
    {
      id: 'ending',
      heading: 'If you want to leave',
      blocks: [
        'You can stop taking jobs at any time, and delete your account under "Your account" — once no booked move or record the law makes us keep is still open.',
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to these terms',
      blocks: [
        'MoversHub tells you of a change to these terms in the app and by email at least 15 days before it applies. If you don\'t agree, you can end your account before then; the old terms apply until you do.',
      ],
    },
    {
      id: 'law',
      heading: 'Applicable law',
      blocks: ['[The applicable law and courts — to be set with the lawyer.]'],
    },
    { id: 'see', heading: 'See also', blocks: [{ see: 'privacy' }, { see: 'contact' }] },
  ],
};
