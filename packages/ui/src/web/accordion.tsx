'use client';

import { cn } from 'cn';
import { Accordion as Primitive } from 'radix-ui';
import type { ReactNode } from 'react';

import { PlusIcon } from './icons';

/** FAQ list: one item open at a time, "+" rotates to "×" (prototype FAQ). */
export function Accordion({
  className,
  children,
  defaultValue,
  value,
  onValueChange,
}: {
  className?: string;
  children: ReactNode;
  /** Item open on first render (prototype opens the first question). */
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <Primitive.Root
      type="single"
      collapsible
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange}
      className={cn('flex flex-col font-sans', className)}
    >
      {children}
    </Primitive.Root>
  );
}

export function AccordionItem({
  value,
  question,
  children,
  className,
}: {
  value: string;
  question: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Primitive.Item value={value} className={cn('border-b border-stone-300', className)}>
      <Primitive.Header className="m-0">
        <Primitive.Trigger className="group flex min-h-11 w-full cursor-pointer items-start gap-4 py-4.5 text-left text-[17px] text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <PlusIcon
            size={18}
            className="mt-0.75 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-45 motion-reduce:transition-none"
          />
          <span>{question}</span>
        </Primitive.Trigger>
      </Primitive.Header>
      <Primitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:animate-none">
        <p className="m-0 max-w-[560px] pb-5 pl-8.5 text-[14.5px] leading-[1.55] text-ink-600">{children}</p>
      </Primitive.Content>
    </Primitive.Item>
  );
}
