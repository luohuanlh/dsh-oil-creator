import type { ReactNode } from "react";

import "./Surface.css";

export function Surface({
  title,
  titleAside,
  hint,
  marker,
  className,
  children,
}: {
  title?: string | undefined;
  titleAside?: ReactNode;
  hint?: string | undefined;
  marker?: string | undefined;
  className?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <section className={["oilSurface", className].filter(Boolean).join(" ")}>
      {marker !== undefined && <span className="oilSurfaceMarker" aria-hidden="true">{marker}</span>}
      <div className="oilSurfaceContent">
        {title !== undefined && titleAside !== undefined
          ? (
            <div className="oilSurfaceHeading">
              <div className="oilSurfaceTitle">{title}</div>
              <div className="oilSurfaceHeadingAside">{titleAside}</div>
            </div>
          )
          : title !== undefined && <div className="oilSurfaceTitle">{title}</div>}
        {hint !== undefined && <p className="oilSurfaceHint">{hint}</p>}
        {children}
      </div>
    </section>
  );
}
