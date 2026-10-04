import Link from "next/link";

/*
  Compact "Works with ChatGPT · Claude" pill that leads to /connect with the matching tab open.
  No vendor logos on purpose: a neutral chat icon and the product names as plain text ("works with",
  never "partner"), so nothing implies endorsement and no brand mark is altered or reproduced.
*/
export default function WorksWith({ className = "" }: { className?: string }) {
  return (
    <p className={`works-with ${className}`}>
      <svg className="works-with-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6.5l-4 3.5V16H7a2.5 2.5 0 0 1-2.5-2.5z" />
        <path d="M8.5 9h7M8.5 12h4.5" />
      </svg>
      <span className="works-with-l">Works with</span>
      <Link href="/connect?tab=chatgpt" aria-label="Use HomeRule in ChatGPT: how to connect">
        ChatGPT
      </Link>
      <span className="works-with-sep" aria-hidden="true">
        ·
      </span>
      <Link href="/connect?tab=claude" aria-label="Use HomeRule in Claude: how to connect">
        Claude
      </Link>
    </p>
  );
}
