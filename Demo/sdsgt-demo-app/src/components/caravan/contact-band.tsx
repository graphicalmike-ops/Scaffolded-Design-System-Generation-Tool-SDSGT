"use client";

import * as React from "react";
import { ArrowRightIcon, CircleCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Container } from "./layout";
import { Reveal } from "./reveal";
import { type } from "./type";

type Errors = Partial<Record<"name" | "email" | "role", string>>;

const benefits = [
  "First look at the full agenda",
  "Workshop seats before they sell out",
  "Scholarship and discount calls",
  "Two emails a month, at most",
];

// Sign-up band: the brand color, with a white form panel on top (design.md, section 6, Forms).
// Nothing is ever sent anywhere; a valid submit shows an inline confirmation instead.
export function ContactBand() {
  const [errors, setErrors] = React.useState<Errors>({});
  const [done, setDone] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const role = String(data.get("role") ?? "");
    const next: Errors = {};
    if (!name) next.name = "Enter your full name.";
    if (!email) next.email = "Enter your work email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter an email like name@company.com.";
    if (!role) next.role = "Choose the role closest to yours.";
    setErrors(next);
    if (Object.keys(next).length === 0) setDone(email);
  }

  return (
    <section id="contact" className="scroll-mt-24 bg-primary py-16 text-primary-foreground md:py-24">
      <Container>
        <Reveal>
          <Card className="mx-auto max-w-5xl gap-0 p-0 text-foreground shadow-xl md:grid md:grid-cols-2">
            <div className="flex flex-col gap-5 p-6 md:p-10">
              <h2 className={cn(type.h2, "text-balance")}>Get on the list</h2>
              <p className={cn(type.bodyLg, "text-pretty text-muted-foreground")}>
                Be first to hear about speaker drops, workshop seats and early-bird deadlines.
              </p>
              <ul className="flex flex-col gap-3">
                {benefits.map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden="true" />
                    <span className={type.bodyLg}>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t p-6 md:border-t-0 md:border-l md:p-10">
              {done ? (
                <div role="status" className="flex h-full flex-col justify-center gap-3">
                  <CircleCheckIcon className="size-8 text-foreground" aria-hidden="true" />
                  <h3 className={type.h4}>You’re on the list</h3>
                  <p className={cn(type.body, "text-muted-foreground")}>
                    Watch your inbox at <strong className="font-semibold text-foreground">{done}</strong> for the full agenda. Nothing was actually sent: this is a prototype.
                  </p>
                  <Button variant="outline" className="mt-2 h-11 w-fit rounded-full px-6 text-base" onClick={() => setDone(null)}>
                    Add someone else
                  </Button>
                </div>
              ) : (
                <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
                  <p className={cn(type.bodySm, "text-muted-foreground")}>*Required field</p>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="name" className={type.bodySmStrong}>Full name*</Label>
                    <Input id="name" name="name" autoComplete="name" className="h-11 text-base" aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} />
                    {errors.name ? <p id="name-error" className={cn(type.bodySm, "text-destructive")}>{errors.name}</p> : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="email" className={type.bodySmStrong}>Work email*</Label>
                    <Input id="email" name="email" type="email" autoComplete="email" className="h-11 text-base" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} />
                    {errors.email ? <p id="email-error" className={cn(type.bodySm, "text-destructive")}>{errors.email}</p> : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="role" className={type.bodySmStrong}>Your role*</Label>
                    <NativeSelect
                      id="role"
                      name="role"
                      defaultValue=""
                      aria-invalid={!!errors.role}
                      aria-describedby={errors.role ? "role-error" : undefined}
                      className="w-full [&_select]:h-11 [&_select]:text-base"
                    >
                      <NativeSelectOption value="" disabled>Choose one</NativeSelectOption>
                      <NativeSelectOption value="Product designer">Product designer</NativeSelectOption>
                      <NativeSelectOption value="Product manager">Product manager</NativeSelectOption>
                      <NativeSelectOption value="Engineer">Engineer</NativeSelectOption>
                      <NativeSelectOption value="Founder or leader">Founder or leader</NativeSelectOption>
                      <NativeSelectOption value="Something else">Something else</NativeSelectOption>
                    </NativeSelect>
                    {errors.role ? <p id="role-error" className={cn(type.bodySm, "text-destructive")}>{errors.role}</p> : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="company" className={type.bodySmStrong}>Company</Label>
                    <Input id="company" name="company" autoComplete="organization" className="h-11 text-base" />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="learn" className={type.bodySmStrong}>What do you want to learn?</Label>
                    <Textarea id="learn" name="learn" rows={3} className="text-base" />
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox id="news" name="news" defaultChecked />
                    <Label htmlFor="news" className={cn(type.bodySm, "items-start leading-snug font-normal")}>
                      Send me speaker announcements and ticket news.
                    </Label>
                  </div>

                  <p className={cn(type.caption, "text-muted-foreground")}>
                    We only use your details for AI Caravan updates. Read our{" "}
                    <a href="#top" className="underline underline-offset-4 hover:no-underline">privacy notice</a>.
                  </p>

                  <Button type="submit" className="group/btn h-11 w-fit rounded-full px-6 text-base">
                    Join the list
                    <ArrowRightIcon className="transition-transform group-hover/btn:translate-x-0.5 motion-reduce:transition-none" data-icon="inline-end" />
                  </Button>
                </form>
              )}
            </div>
          </Card>
        </Reveal>
      </Container>
    </section>
  );
}
