import React from "react";

/**
 * NFT Studio footer — minimal.
 */
export const Footer = () => {
  return (
    <footer className="border-t border-base-content/10 bg-base-300/60 text-xs px-4 py-2 flex items-center justify-between shrink-0">
      <span className="opacity-60">NFT Studio · client-side, no upload, no chain</span>
      <span className="opacity-50">v1.0</span>
    </footer>
  );
};
