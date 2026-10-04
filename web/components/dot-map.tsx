import type { PanelFrame } from "@/lib/geo";

/* SVG dot maps: no base map, no library. Coordinates come from the Census geocoder. */

export function PinMap({ frame, pinId, label }: { frame: PanelFrame; pinId: string; label: string }) {
  const pin = frame.points.find((p) => p.id === pinId);
  return (
    <figure>
      <svg
        className="map"
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        role="img"
        aria-label={pin ? `Map: ${label} among the sample addresses nearby` : "Map: no coordinates for this address"}
      >
        <rect x="0.5" y="0.5" width={frame.width - 1} height={frame.height - 1} rx="12" fill="#fff" stroke="var(--line)" />
        {frame.points.map((p) =>
          p.id === pinId ? null : <circle key={p.id} cx={p.x} cy={p.y} r="2.2" fill="var(--line-strong)" />,
        )}
        {pin && (
          <g>
            <circle cx={pin.x} cy={pin.y} r="11" fill="var(--teal)" opacity="0.12" />
            <circle cx={pin.x} cy={pin.y} r="5" fill="var(--teal)" stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>
      <figcaption className="map-caption">
        {pin ? "Grey dots: other sample addresses. No base map." : "No coordinates for this address."}
      </figcaption>
    </figure>
  );
}
