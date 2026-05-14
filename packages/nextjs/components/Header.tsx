"use client";

import React from "react";
import { PaintBrushIcon } from "@heroicons/react/24/outline";

/**
 * NFT Studio header — minimal, no wallet connect.
 */
export const Header = () => {
  return (
    <header className="flex items-center justify-between bg-base-300/80 backdrop-blur border-b border-base-content/10 px-4 py-2 shrink-0">
      <div className="flex items-center gap-2">
        <div className="bg-primary/20 rounded-md p-1.5">
          <PaintBrushIcon className="h-5 w-5 text-base-content" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-sm">NFT Studio</span>
          <span className="text-[10px] uppercase tracking-widest opacity-60">Browser canvas editor</span>
        </div>
      </div>
      <div className="text-xs opacity-60 hidden md:block">
        Layers · Brush · Outline · Background removal · Export
      </div>
    </header>
  );
};
