import "./caravan.css";
import { AnnouncementBar } from "@/components/caravan/announcement-bar";
import { ContactBand } from "@/components/caravan/contact-band";
import { Footer, FloatingButton } from "@/components/caravan/footer-fab";
import { Hero } from "@/components/caravan/hero";
import { Partners } from "@/components/caravan/partners";
import { SiteHeader } from "@/components/caravan/site-header";
import { Agenda, Speakers, Testimonial } from "@/components/caravan/speakers-agenda";
import { Experiences, Stats } from "@/components/caravan/stats-experiences";
import { Tracks } from "@/components/caravan/tracks";
import { Faq, Tickets, Venue } from "@/components/caravan/venue-tickets-faq";

// AI Caravan 2026 — a mock-up event page built from the generated design system and design.md.
export default function Home() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
      >
        Skip to content
      </a>
      <AnnouncementBar />
      <SiteHeader />
      <main id="main">
        <Hero />
        <Partners />
        <Tracks />
        <Stats />
        <Experiences />
        <Speakers />
        <Agenda />
        <Testimonial />
        <Venue />
        <Tickets />
        <Faq />
        <ContactBand />
      </main>
      <Footer />
      <FloatingButton />
    </>
  );
}
