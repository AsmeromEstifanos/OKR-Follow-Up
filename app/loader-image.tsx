"use client";

import { withBasePath } from "@/lib/base-path";

type Props = {
  size?: number;
  className?: string;
  src?: string;
};

export default function LoaderImage({
  size = 64,
  className = "",
  src = withBasePath("/loader-ring.svg"),
}: Props): JSX.Element {
  const aspectRatio = 320 / 512;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Loading"
      width={size}
      height={Math.round(size * aspectRatio)}
      className={`loader-image ${className}`.trim()}
    />
  );
}
