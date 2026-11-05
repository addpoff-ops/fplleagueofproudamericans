"use client";

import { useState } from "react";

export function Avatar({ avatar, name, size = 28 }: { avatar: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (avatar && !failed)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://sleepercdn.com/avatars/thumbs/${avatar}`}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full"
      />
    );
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
