import { describe, expect, it } from 'vitest';

import {
  REGISTRATION_KINDS,
  TAX_ID_KINDS,
  hasIso7064Mod1110,
  isAustrianUid,
  isMacedonian13,
  isNip,
  isPesel,
  isRegon,
  isSwissUid,
  matchId,
  nameWords,
  parseNipt,
  sameCompanyName,
} from './company-ids';
import { MOVER_COUNTRIES } from './schemas/mover-company';

// Valid numbers below are published examples (registers, tax offices, VIES documentation) or the
// test numbers of the python-stdnum / stdnum-js libraries; each invalid one changes a valid one's last digit.

describe('check digits', () => {
  it('Polish NIP', () => {
    for (const ok of ['5260250995', '7740001454', '1234563218']) expect(isNip(ok)).toBe(true);
    for (const bad of ['5260250994', '123456321', '12345632180']) expect(isNip(bad)).toBe(false);
  });

  it('Polish PESEL', () => {
    expect(isPesel('44051401359')).toBe(true);
    expect(isPesel('44051401358')).toBe(false);
  });

  it('Polish REGON (9 and 14 digits)', () => {
    for (const ok of ['192598184', '123456785', '12345678512347']) expect(isRegon(ok)).toBe(true);
    for (const bad of ['192598183', '12345678612342', '12345678512348', '12345678']) expect(isRegon(bad)).toBe(false);
  });

  it('German USt-IdNr. and tax IdNr (ISO 7064 MOD 11,10)', () => {
    expect(hasIso7064Mod1110('136695976')).toBe(true);
    expect(hasIso7064Mod1110('136695978')).toBe(false);
    expect(hasIso7064Mod1110('86095742719')).toBe(true);
    expect(hasIso7064Mod1110('86095742718')).toBe(false);
  });

  it('Austrian UID', () => {
    expect(isAustrianUid('U13585627')).toBe(true);
    expect(isAustrianUid('U13585626')).toBe(false);
  });

  it('Swiss UID', () => {
    for (const ok of ['CHE100155212', 'CHE109910570']) expect(isSwissUid(ok)).toBe(true);
    expect(isSwissUid('CHE100155211')).toBe(false);
  });

  it('North Macedonian EDB and EMBG', () => {
    for (const ok of ['4030000375897', '4057018541765', '4057019547848', '4061018502090', '4071016500495', '0101990450006'])
      expect(isMacedonian13(ok)).toBe(true);
    for (const bad of ['4057019547840', '405701954784']) expect(isMacedonian13(bad)).toBe(false);
  });

  it('Albanian NIPT format', () => {
    for (const ok of ['I05101999Q', 'K52224002A', 'L42307014K']) expect(parseNipt(ok)).toBe(ok);
    expect(parseNipt('AL J 91402501 L')).toBe('J91402501L');
    for (const bad of ['Z22218003V', 'J91402501', 'J9140250LL']) expect(parseNipt(bad)).toBeNull();
  });
});

describe('numbers as typed → as stored', () => {
  const tax = (country: keyof typeof TAX_ID_KINDS, raw: string, person = false) =>
    matchId(TAX_ID_KINDS[country][person ? 'person' : 'business'], raw)?.value ?? null;

  it('drops spaces, dots, dashes and the country prefix where the number has none', () => {
    expect(tax('PL', 'PL 526-025-09-95')).toBe('5260250995');
    expect(tax('MK', 'MK 4030000375897')).toBe('4030000375897');
    expect(tax('MK', 'МК4020990116747')).toBe('4020990116747'); // Cyrillic prefix
    expect(tax('AL', 'k52224002a')).toBe('K52224002A');
    expect(tax('XK', '601 234 567')).toBe('601234567');
  });

  it('keeps the prefix of EU VAT numbers and Swiss UIDs (the registers need it)', () => {
    expect(tax('DE', 'DE 136 695 976')).toBe('DE136695976');
    expect(tax('DE', '136695976')).toBe('DE136695976');
    expect(tax('AT', 'ATU 1358 5627')).toBe('ATU13585627');
    expect(tax('CH', 'CHE-100.155.212 MWST')).toBe('CHE100155212');
  });

  it('accepts a German or Austrian tax office number as written', () => {
    expect(tax('DE', '123/456/78901')).toBe('123/456/78901');
    expect(tax('AT', '12 345/6789')).toBe('12 345/6789');
    expect(tax('DE', '12/345')).toBeNull();
  });

  it('accepts personal numbers from private persons only', () => {
    expect(tax('PL', '44051401359')).toBeNull();
    expect(tax('PL', '44051401359', true)).toBe('44051401359');
    expect(tax('DE', '86095742719', true)).toBe('86095742719');
    expect(tax('MK', '0101990450006', true)).toBe('0101990450006');
  });

  it('refuses a wrong check digit or format', () => {
    expect(tax('PL', '5260250994')).toBeNull();
    expect(tax('DE', 'DE136695978')).toBeNull();
    expect(tax('AT', 'ATU13585626')).toBeNull();
    expect(tax('CH', 'CHE-100.155.211')).toBeNull();
    expect(tax('MK', '4057019547840')).toBeNull();
    expect(tax('XK', '1234567')).toBeNull();
  });

  it('registration numbers: KRS or REGON in Poland, EMBS in North Macedonia, HRB / FN when given', () => {
    const reg = (country: keyof typeof REGISTRATION_KINDS, raw: string) => {
      const rule = REGISTRATION_KINDS[country];
      return rule.rule === 'sameAsTax' ? 'sameAsTax' : (matchId(rule.kinds, raw)?.value ?? null);
    };
    expect(reg('PL', '0000123456')).toBe('0000123456');
    expect(reg('PL', '123456785')).toBe('123456785');
    expect(reg('PL', '123456786')).toBeNull();
    expect(reg('MK', '7123456')).toBe('7123456');
    expect(reg('DE', 'Amtsgericht München HRB 123456')).toBe('Amtsgericht München HRB 123456');
    expect(reg('DE', '123456')).toBeNull();
    expect(reg('AT', 'fn 123456A')).toBe('FN 123456a');
    expect(reg('AL', 'anything')).toBe('sameAsTax');
    expect(reg('CH', 'anything')).toBe('sameAsTax');
  });

  it('has rules for every country movers can choose', () => {
    for (const country of MOVER_COUNTRIES) {
      expect(TAX_ID_KINDS[country].business.length).toBeGreaterThan(0);
      expect(TAX_ID_KINDS[country].person.length).toBeGreaterThan(0);
      expect(REGISTRATION_KINDS[country]).toBeDefined();
    }
  });
});

describe('company names', () => {
  it('compares without legal forms, accents and punctuation', () => {
    expect(nameWords('Lëvizje Sh.p.k.')).toEqual(['levizje']);
    expect(sameCompanyName('Lëvizje Shpk', 'LEVIZJE SH.P.K.')).toBe(true);
    expect(sameCompanyName('Przeprowadzki Łódź', 'PRZEPROWADZKI LODZ SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ')).toBe(true);
    expect(sameCompanyName('Umzüge Berger', 'Umzüge Berger GmbH & Co. KG')).toBe(true);
    expect(sameCompanyName('Berger Transporte', 'Berger Transporte und Umzüge GmbH')).toBe(true);
  });

  it('tells different companies apart', () => {
    expect(sameCompanyName('Lëvizje Shpk', 'Transporti Ilirida Sh.p.k.')).toBe(false);
    expect(sameCompanyName('Umzüge Berger', 'Möbelspedition Koch GmbH')).toBe(false);
    expect(sameCompanyName('GmbH', 'Berger GmbH')).toBe(false);
  });
});
