"use client";

import dynamic from "next/dynamic";

const NftStudio = dynamic(() => import("~~/components/NftStudio").then(m => m.NftStudio), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen w-screen text-base-content/80">
      <div className="flex flex-col items-center gap-3">
        <span className="loading loading-spinner loading-lg" />
        <span className="text-sm tracking-wide">Loading NFT Studio…</span>
      </div>
    </div>
  ),
});

export default function Page() {
  return <NftStudio />;
}
