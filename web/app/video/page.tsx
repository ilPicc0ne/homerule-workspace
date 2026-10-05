import type { Metadata } from "next";
import Link from "next/link";
import s from "./video.module.css";

/*
  /video: the submission videos (demo and technical), for sharing by link.
  Not linked from the site and kept out of search results (robots: noindex).
  Files: public/video/*.mp4, posters *.jpg.
*/

export const metadata: Metadata = {
  title: "Videos",
  description: "HomeRule in two minutes: the demo and how it works.",
  robots: { index: false, follow: false },
};

const VIDEOS = [
  {
    id: "demo",
    kicker: "Demo · 58 s",
    title: "One renter, one address, the law that applies",
    src: "/video/homerule-demo.mp4",
    poster: "/video/homerule-demo.jpg",
  },
  {
    id: "technical",
    kicker: "How it works · 60 s",
    title: "From law text to dated, quoted answers",
    src: "/video/homerule-technical.mp4",
    poster: "/video/homerule-technical.jpg",
  },
];

export default function VideoPage() {
  return (
    <main className={`wrap ${s.page}`}>
      <div className={s.head}>
        <p className={s.kicker}>Hack-Nation 7 · RealPage challenge</p>
        <h1>HomeRule in two minutes</h1>
        <p className={s.sub}>
          Your rights as a renter, for your exact address: every answer quotes the law with its date, and says unknown when a
          fact is missing. Try it at <Link href="/">yourhomerule.com</Link>.
        </p>
      </div>

      {VIDEOS.map((v) => (
        <section key={v.id} id={v.id} aria-labelledby={`${v.id}-title`} className={s.card}>
          <p className={s.label}>{v.kicker}</p>
          <h2 id={`${v.id}-title`} className={s.title}>
            {v.title}
          </h2>
          <video className={s.video} controls playsInline preload="metadata" poster={v.poster}>
            <source src={v.src} type="video/mp4" />
            Your browser can&rsquo;t play this video. <a href={v.src}>Download it</a>.
          </video>
        </section>
      ))}

      <p className={s.hint}>Prototype · not legal advice.</p>
    </main>
  );
}
