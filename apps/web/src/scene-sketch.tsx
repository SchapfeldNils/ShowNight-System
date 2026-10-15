import {
  useEffect,
  useState,
  type ReactNode,
  type Ref,
  type SVGProps,
} from "react";
import type {
  SceneDefinition,
  SceneLayer,
} from "../../../packages/contracts/src/scene.js";

function MissingMedia({
  layer,
  text,
}: {
  layer: Extract<SceneLayer, { kind: "image" }>;
  text: string;
}) {
  const size = Math.max(12, Math.min(48, layer.height / 6, layer.width / 12));
  return (
    <>
      <rect
        width={layer.width}
        height={layer.height}
        fill="#5a2533"
        stroke="#ff8a8a"
        strokeWidth={4}
        strokeDasharray="16 10"
        vectorEffect="non-scaling-stroke"
      />
      <text x="8" y={size + 4} fill="#ffffff" fontSize={size}>
        {text}
      </text>
    </>
  );
}

function SceneImage({
  layer,
  source,
}: {
  layer: Extract<SceneLayer, { kind: "image" }>;
  source: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return failed ? (
    <MissingMedia layer={layer} text="Medium nicht verfügbar" />
  ) : (
    <image
      href={source}
      width={layer.width}
      height={layer.height}
      preserveAspectRatio={
        layer.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"
      }
      onError={() => setFailed(true)}
    />
  );
}

export function SceneSketch({
  definition,
  mediaUrl,
  missing,
  svgRef,
  svgProps,
  children,
}: {
  definition: SceneDefinition;
  mediaUrl?: (id: string) => string;
  /** Media known to be absent: shown as a clear placeholder without loading. */
  missing?: (id: string) => boolean;
  svgRef?: Ref<SVGSVGElement>;
  svgProps?: SVGProps<SVGSVGElement>;
  /** Editor overlays (selection, handles, guides) in logical coordinates. */
  children?: ReactNode;
}) {
  return (
    <svg
      className="scene-sketch"
      {...svgProps}
      ref={svgRef}
      viewBox={`0 0 ${definition.logicalWidth} ${definition.logicalHeight}`}
      role="img"
      aria-label="Gestaltungsentwurf im Browser"
    >
      <rect
        width={definition.logicalWidth}
        height={definition.logicalHeight}
        fill={definition.background}
      />
      {definition.layers
        .filter((l) => l.visible)
        .map((l) => (
          <svg
            key={l.id}
            x={l.x}
            y={l.y}
            width={l.width}
            height={l.height}
            opacity={l.opacity}
            viewBox={`0 0 ${l.width} ${l.height}`}
            overflow="hidden"
            pointerEvents="none"
          >
            {l.kind === "rectangle" ? (
              <rect width={l.width} height={l.height} fill={l.color} />
            ) : l.kind === "text" ? (
              <text
                x="0"
                y={l.fontSize}
                fill={l.color}
                fontSize={l.fontSize}
                fontFamily="Arial"
              >
                {l.text.split("\n").map((line, i) => (
                  <tspan key={i} x="0" dy={i ? l.fontSize * 1.2 : 0}>
                    {line}
                  </tspan>
                ))}
              </text>
            ) : missing?.(l.mediaId) ? (
              <MissingMedia layer={l} text="Medium fehlt" />
            ) : mediaUrl ? (
              <SceneImage layer={l} source={mediaUrl(l.mediaId)} />
            ) : (
              <>
                <rect width={l.width} height={l.height} fill="#334155" />
                <text x="8" y="30" fill="#ffffff" fontSize="24">
                  Bildebene
                </text>
              </>
            )}
          </svg>
        ))}
      {children}
    </svg>
  );
}
