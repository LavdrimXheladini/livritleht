'use client';

import { useState } from 'react';

import { formatMoney, type Locale, type VehicleClass } from '@ranktrip/shared';
import {
  Accordion,
  AccordionItem,
  Button,
  Card,
  ChipGroup,
  CrewPills,
  DarkPanel,
  Gauge,
  LiveMapCard,
  LogoMark,
  Pill,
  ProgressBar,
  SectionTitle,
  Sheet,
  StatCard,
  SwapIcon,
  Timeline,
  VanIcon,
  VehicleClassTile,
} from '@ranktrip/ui/web';

// DEV-ONLY sample content (English, not translated): this page 404s in production.
// Prices are fake "from" labels — real ones come from the server quote (COMPLIANCE §1.1).
const CLASSES: { id: VehicleClass; name: string; capacity: string; example: string; fits: string; fromCents?: number; offers?: number }[] = [
  { id: 'SMALL', name: 'Small', capacity: '≤ 3 m³', example: 'Caddy · Berlingo', fits: 'Boxes, luggage, small furniture', fromCents: 4900, offers: 6 },
  { id: 'VAN', name: 'Van', capacity: '~6 m³', example: 'Transit Custom · Vivaro', fits: 'Sofa, fridge, a few large items', fromCents: 7200, offers: 4 },
  { id: 'LARGE_VAN', name: 'Large van', capacity: '12–15 m³', example: 'Sprinter · Ducato · Crafter', fits: 'Studio / 1-room flat', fromCents: 11900, offers: 3 },
  { id: 'BOX', name: 'Box', capacity: '18–22 m³', example: 'Luton with tail lift', fits: '2–3 room flat', fromCents: 18900, offers: 1 },
  { id: 'TRUCK', name: 'Truck', capacity: '30 m³+', example: 'Truck > 3.5 t', fits: 'Houses, offices' },
];

const CORRIDORS = ['Prishtina → Prizren', 'Prishtina → Tirana', 'Munich → Prishtina', 'Warsaw → Kraków'] as const;

function Label({ children }: { children: string }) {
  return <p className="mb-3 font-mono text-xs tracking-wide text-ink-500 uppercase">{children}</p>;
}

export function UiKit({ locale }: { locale: Locale }) {
  const [cls, setCls] = useState<VehicleClass>('LARGE_VAN');
  const [crew, setCrew] = useState<1 | 2 | 3>(2);
  const [corridor, setCorridor] = useState<string>(CORRIDORS[0]);
  const [view, setView] = useState<'map' | 'load'>('map');

  return (
    <main className="flex flex-col gap-5 p-5 pb-10">
      {/* ── Light: typography, buttons, pills, chips ───────────────────── */}
      <Sheet tone="cream" padding="section">
        <div className="mx-auto mb-12 flex w-fit flex-col items-center gap-1">
          <LogoMark className="text-ink-900" />
          <span className="type-wordmark text-[11px]">RANKTRIP</span>
        </div>
        <SectionTitle
          as="h1"
          size="hero"
          title={<>Move anything,<br />wherever home is.</>}
          subtitle="Hero title (clamp 44–96px, Archivo 118%) and subtitle (19px Geist)."
        />
        <div className="mx-auto mt-14 flex max-w-[980px] flex-col gap-8">
          <div>
            <Label>Button</Label>
            <div className="flex flex-wrap items-center gap-2.5">
              <Button>Get a price</Button>
              <Button size="lg">Request movers</Button>
              <Button variant="secondary">I have a van</Button>
              <Button variant="ghost">EN ▾</Button>
              <Button variant="outline" size="icon" aria-label="Swap pickup and drop-off">
                <SwapIcon size={18} />
              </Button>
              <Button variant="accent">Join waitlist</Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
          <div>
            <Label>Pill</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Pill>Pricing</Pill>
              <Pill tone="brand">Launch market</Pill>
              <Pill tone="accent">Corridors</Pill>
              <Pill tone="accent" size="sm">On the way</Pill>
              <span className="rounded-full bg-night-900 p-2">
                <Pill tone="accent-soft" size="sm">● Online</Pill>
              </span>
            </div>
          </div>
          <div>
            <Label>Chip · CrewPills · corridor tiles</Label>
            <div className="flex flex-col gap-4">
              <CrewPills
                value={crew}
                onChange={setCrew}
                groupLabel="Crew"
                labels={{ 1: 'Driver', 2: '+1 helper', 3: '+2 helpers' }}
              />
              <ChipGroup
                variant="tile"
                ariaLabel="Popular corridors"
                value={corridor}
                onChange={setCorridor}
                options={CORRIDORS.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </div>
        </div>
      </Sheet>

      {/* ── Sand: stat cards ───────────────────────────────────────────── */}
      <Sheet tone="sand">
        <SectionTitle title="Built for real moves." subtitle="SectionTitle + StatCard (hover to lift)." />
        <div className="mx-auto mt-14 grid max-w-[1000px] grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4.5">
          <StatCard tag="Pricing" word="Upfront." line="Price before you book." note="Each mover sets their own rates." />
          <StatCard tag="Tracking" word="Live." line="GPS from pickup to door." note="Share the link with family." />
          <StatCard tag="Payment" word="By card." line="Paid securely in the app." note="Processed by Stripe." />
        </div>
      </Sheet>

      {/* ── Paper: quote widget pieces ─────────────────────────────────── */}
      <Sheet tone="paper">
        <SectionTitle title="Quote widget parts" subtitle="Card (widget) · VehicleClassTile ×5 · CrewPills · inset Card" />
        <Card variant="widget" className="mx-auto mt-12 flex max-w-[980px] flex-col gap-4.5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
            {CLASSES.map((k) => (
              <VehicleClassTile
                key={k.id}
                name={k.name}
                capacity={k.capacity}
                example={k.example}
                fits={k.fits}
                priceLabel={k.fromCents === undefined ? undefined : `from ${formatMoney(k.fromCents, 'EUR', locale)}`}
                offersLabel={k.offers ? `${k.offers} ${k.offers === 1 ? 'mover' : 'movers'}` : undefined}
                unavailable="No movers yet"
                selected={cls === k.id}
                onClick={() => setCls(k.id)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-300 pt-4.5">
            <CrewPills value={crew} onChange={setCrew} groupLabel="Crew" labels={{ 1: 'Driver', 2: '+1 helper', 3: '+2 helpers' }} />
            <Button size="lg">See movers</Button>
          </div>
        </Card>
        <Card variant="inset" className="mx-auto mt-6 flex max-w-[520px] items-center gap-4.5">
          <div className="flex h-16 w-21 shrink-0 items-center justify-center rounded-md bg-night-700">
            <span className="size-3 rounded-full bg-accent-500 motion-safe:animate-pulse-ring" />
          </div>
          <div>
            <div className="text-[15px] font-semibold">Independent movers</div>
            <div className="mt-0.75 text-[13.5px] leading-[1.45] text-ink-600">
              Local businesses with their own vans. They set their rates and choose their jobs.
            </div>
          </div>
        </Card>
      </Sheet>

      {/* ── Paper: FAQ accordion ───────────────────────────────────────── */}
      <Sheet tone="paper">
        <div className="mx-auto flex max-w-[1080px] flex-wrap gap-12">
          <SectionTitle align="left" className="flex-[1_1_min(300px,100%)]" title={<>Frequently<br />asked<br />questions.</>} />
          <Accordion defaultValue="q1" className="flex-[1.4_1_min(420px,100%)]">
            <AccordionItem value="q1" question="Who are the movers?">
              Independent businesses with their own vans. Each one sets their own rates.
            </AccordionItem>
            <AccordionItem value="q2" question="How is the price calculated?">
              From your mover&apos;s own rates for the vehicle, distance and crew.
            </AccordionItem>
            <AccordionItem value="q3" question="Can I track my mover?">
              Yes — live on the map while the job is active.
            </AccordionItem>
          </Accordion>
        </div>
      </Sheet>

      {/* ── Night: live map + ops pieces ───────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1400px] rounded-device bg-night-950 p-5 text-night-50">
        <p className="mb-3 font-mono text-xs tracking-wide text-sage-400 uppercase">DarkPanel · LiveMapCard · Gauge · ProgressBar · Timeline</p>
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <DarkPanel variant="frame">
            <div className="relative h-[380px] overflow-hidden rounded-card bg-night-700">
              <LiveMapCard
                className="absolute top-5 left-5"
                title="Demo Movers Co. (sample)"
                status="On the way"
                subtitle="Large van · your mover"
                avatar="DM"
                route="Prishtina → Prizren"
                progress={0.62}
                progressLabel="Route progress"
                stats={[
                  { label: 'Speed', value: 74, unit: 'km/h' },
                  { label: 'Left', value: 31, unit: 'km' },
                  { label: 'ETA', value: '26 min' },
                ]}
              />
              <span className="absolute top-[64%] left-[70%] flex size-8.5 -translate-1/2 items-center justify-center rounded-full bg-accent-500 text-ink-900 motion-safe:animate-pulse-ring">
                <VanIcon size={18} strokeWidth={2.2} />
              </span>
            </div>
          </DarkPanel>
          <div className="flex flex-col gap-4">
            <ChipGroup
              variant="dark"
              ariaLabel="View"
              value={view}
              onChange={setView}
              className="self-start"
              options={[
                { value: 'map', label: 'Map' },
                { value: 'load', label: 'Van load' },
              ]}
            />
            <DarkPanel className="grid grid-cols-2 gap-2">
              <Gauge kind="arc" value={62} max={130} label="Speed" unit="km/h" />
              <Gauge kind="tank" percent={41} label="Van load" caption="5.3 / 13 m³" />
            </DarkPanel>
            <DarkPanel className="flex flex-col gap-3">
              <div className="flex justify-between text-[12.5px]">
                <span>Prishtina → Prizren</span>
                <span className="font-mono">82 km</span>
              </div>
              <ProgressBar value={0.6} label="Route progress" tone="gradient" size="md" />
              <div className="flex flex-wrap gap-1.5">
                <Pill tone="dark" shape="tag" size="md">Large van</Pill>
                <Pill tone="dark" shape="tag" size="md">Driver + 1 helper</Pill>
                <Pill tone="dark-muted" size="sm">Loading</Pill>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline-dark" className="flex-1">Decline</Button>
                <Button variant="accent" className="flex-[1.4]">Accept job</Button>
              </div>
            </DarkPanel>
          </div>
        </div>
        <Timeline
          className="mt-4"
          label="Move progress"
          steps={[
            { label: 'Booked', sub: 'Card saved', state: 'done' },
            { label: 'Mover accepted', sub: "Demo Movers Co.", state: 'done' },
            { label: 'Picked up', sub: 'Prishtina', state: 'done' },
            { label: 'On the way', sub: '31 km left', state: 'current' },
            { label: 'Delivered', sub: 'Prizren', state: 'todo' },
          ]}
        />
      </section>
    </main>
  );
}
