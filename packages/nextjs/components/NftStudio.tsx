"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ArrowsPointingOutIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  CursorArrowRaysIcon,
  DocumentArrowUpIcon,
  EyeIcon,
  EyeSlashIcon,
  FolderArrowDownIcon,
  FolderOpenIcon,
  LockClosedIcon,
  LockOpenIcon,
  PaintBrushIcon,
  PhotoIcon,
  PlusIcon,
  Squares2X2Icon,
  SwatchIcon,
  SparklesIcon,
  TrashIcon,
  ViewfinderCircleIcon,
} from "@heroicons/react/24/outline";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type Tool = "select" | "brush" | "eraser" | "eyedropper";

type LayerMeta = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
};

type BrushSettings = {
  size: number;
  opacity: number;
  softness: number;
  shape: "round" | "square";
  color: string;
};

type CanvasSettings = {
  width: number;
  height: number;
  backgroundColor: string;
  transparent: boolean;
  showGrid: boolean;
};

type SerializedLayer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  width: number;
  height: number;
  zIndex: number;
  dataUrl: string;
};

type ProjectFile = {
  version: 1;
  canvas: CanvasSettings;
  layers: SerializedLayer[];
};

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                 */
/* -------------------------------------------------------------------------- */

const uid = () => Math.random().toString(36).slice(2, 10);

const triggerDownload = (dataUrl: string, filename: string) => {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export const NftStudio: React.FC = () => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<any>(null); // fabric namespace
  const canvasRef = useRef<any>(null); // fabric.Canvas
  const gridLayerRef = useRef<any>(null);
  const snapGuidesRef = useRef<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  const [ready, setReady] = useState(false);

  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerMeta[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const [brush, setBrush] = useState<BrushSettings>({
    size: 28,
    opacity: 0.35,
    softness: 0.75,
    shape: "round",
    color: "#ffffff",
  });

  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings>({
    width: 1080,
    height: 1080,
    backgroundColor: "#1f2937",
    transparent: true,
    showGrid: false,
  });

  const [busy, setBusy] = useState<string | null>(null);

  /* ----------------------------- Fabric setup ----------------------------- */

  useEffect(() => {
    let disposed = false;
    let canvas: any = null;

    (async () => {
      const fabric = await import("fabric");
      if (disposed || !canvasElRef.current) return;
      fabricRef.current = fabric;

      canvas = new fabric.Canvas(canvasElRef.current, {
        width: canvasSettings.width,
        height: canvasSettings.height,
        backgroundColor: canvasSettings.transparent ? undefined : canvasSettings.backgroundColor,
        preserveObjectStacking: true,
        selection: true,
      });

      // Center transparent checker background via CSS, fabric handles real bg.
      if (canvasSettings.transparent) {
        canvas.backgroundColor = undefined;
      }

      canvasRef.current = canvas;

      // Selection events sync to React state
      const syncActive = () => {
        const obj = canvas.getActiveObject();
        if (!obj) {
          setActiveId(null);
          return;
        }
        setActiveId((obj as any).layerId ?? null);
      };
      canvas.on("selection:created", syncActive);
      canvas.on("selection:updated", syncActive);
      canvas.on("selection:cleared", () => setActiveId(null));

      // Re-render when objects change
      canvas.on("object:modified", () => canvas.requestRenderAll());

      // Zoom on mouse wheel
      canvas.on("mouse:wheel", (opt: any) => {
        const e = opt.e as WheelEvent;
        if (e.ctrlKey || e.metaKey) {
          // pan horizontal
          const vpt = canvas.viewportTransform!;
          vpt[4] -= e.deltaY;
          canvas.setViewportTransform(vpt);
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (e.shiftKey) {
          // zoom only with shift+wheel
          const delta = e.deltaY;
          let z = canvas.getZoom();
          z *= 0.999 ** delta;
          z = Math.min(Math.max(z, 0.1), 20);
          canvas.zoomToPoint({ x: e.offsetX, y: e.offsetY }, z);
          setZoom(z);
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // default: vertical pan
        const vpt = canvas.viewportTransform!;
        vpt[5] -= e.deltaY;
        canvas.setViewportTransform(vpt);
        e.preventDefault();
        e.stopPropagation();
      });

      // Snap on moving
      canvas.on("object:moving", (opt: any) => {
        snapToGuides(opt.target);
      });
      canvas.on("object:modified", () => {
        clearSnapGuides();
      });

      // Sample color on click when eyedropper tool active
      canvas.on("mouse:down", (opt: any) => {
        if (tool === "eyedropper" && opt.pointer) {
          sampleColor(opt.pointer.x, opt.pointer.y);
        }
      });

      // Initial fit
      setReady(true);
      fitToViewport();
      canvas.requestRenderAll();
    })();

    return () => {
      disposed = true;
      if (canvas) {
        try {
          canvas.dispose();
        } catch {
          /* ignore */
        }
      }
      canvasRef.current = null;
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------- Tool side effects -------------------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return;
    canvas.isDrawingMode = tool === "brush" || tool === "eraser";

    if (canvas.isDrawingMode) {
      const pencil = new fabric.PencilBrush(canvas);
      pencil.color = applyAlpha(brush.color, brush.opacity);
      pencil.width = brush.size;
      // softness simulated via shadow
      if (brush.softness > 0) {
        pencil.shadow = new fabric.Shadow({
          color: applyAlpha(brush.color, brush.opacity),
          blur: brush.size * brush.softness * 0.6,
          offsetX: 0,
          offsetY: 0,
        });
      } else {
        pencil.shadow = null;
      }
      (pencil as any).strokeLineCap = brush.shape === "round" ? "round" : "square";
      (pencil as any).strokeLineJoin = "round";
      if (tool === "eraser") {
        // approximate erase via destination-out on the brush context
        (pencil as any).globalCompositeOperation = "destination-out";
        pencil.color = "rgba(0,0,0,1)";
        pencil.shadow = null;
      }
      canvas.freeDrawingBrush = pencil;
    }
  }, [tool, brush]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvasSettings.transparent) {
      canvas.backgroundColor = undefined as any;
    } else {
      canvas.backgroundColor = canvasSettings.backgroundColor;
    }
    canvas.setDimensions({ width: canvasSettings.width, height: canvasSettings.height });
    canvas.requestRenderAll();
    drawGrid();
    fitToViewport();
  }, [canvasSettings]);

  /* ----------------------------- Helpers --------------------------------- */

  const applyAlpha = (hex: string, alpha: number) => {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const refreshLayers = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const objs = canvas.getObjects().filter((o: any) => o.layerId && o.layerId !== "__grid__");
    setLayers(
      objs.map((o: any) => ({
        id: o.layerId,
        name: o.layerName ?? "Layer",
        visible: o.visible !== false,
        locked: !!o.lockMovementX,
      })),
    );
  }, []);

  const findObject = useCallback(
    (id: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.getObjects().find((o: any) => o.layerId === id) ?? null;
    },
    [],
  );

  const fitToViewport = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapperRef.current;
    if (!canvas || !wrap) return;
    const padding = 48;
    const aw = wrap.clientWidth - padding * 2;
    const ah = wrap.clientHeight - padding * 2;
    if (aw <= 0 || ah <= 0) return;
    const z = Math.min(aw / canvasSettings.width, ah / canvasSettings.height, 1);
    canvas.setZoom(z);
    canvas.setViewportTransform([
      z,
      0,
      0,
      z,
      (wrap.clientWidth - canvasSettings.width * z) / 2,
      (wrap.clientHeight - canvasSettings.height * z) / 2,
    ]);
    setZoom(z);
    canvas.requestRenderAll();
  }, [canvasSettings.width, canvasSettings.height]);

  useEffect(() => {
    const onResize = () => fitToViewport();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fitToViewport]);

  /* ----------------------------- Grid ------------------------------------ */

  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return;
    // remove old grid
    if (gridLayerRef.current) {
      canvas.remove(gridLayerRef.current);
      gridLayerRef.current = null;
    }
    if (!canvasSettings.showGrid) {
      canvas.requestRenderAll();
      return;
    }
    const lines: any[] = [];
    const step = 60;
    const color = "rgba(255,255,255,0.06)";
    for (let x = 0; x <= canvasSettings.width; x += step) {
      lines.push(
        new fabric.Line([x, 0, x, canvasSettings.height], {
          stroke: color,
          selectable: false,
          evented: false,
        }),
      );
    }
    for (let y = 0; y <= canvasSettings.height; y += step) {
      lines.push(
        new fabric.Line([0, y, canvasSettings.width, y], {
          stroke: color,
          selectable: false,
          evented: false,
        }),
      );
    }
    const group = new fabric.Group(lines, { selectable: false, evented: false });
    (group as any).layerId = "__grid__";
    gridLayerRef.current = group;
    canvas.add(group);
    canvas.sendObjectToBack(group);
    canvas.requestRenderAll();
  }, [canvasSettings.showGrid, canvasSettings.width, canvasSettings.height]);

  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  /* ----------------------------- Snap guides ----------------------------- */

  const clearSnapGuides = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    snapGuidesRef.current.forEach(g => canvas.remove(g));
    snapGuidesRef.current = [];
    canvas.requestRenderAll();
  };

  const snapToGuides = (target: any) => {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric || !target) return;
    clearSnapGuides();
    const SNAP = 6;
    const cw = canvasSettings.width;
    const ch = canvasSettings.height;

    const bb = target.getBoundingRect();
    const targets = {
      left: bb.left,
      right: bb.left + bb.width,
      centerX: bb.left + bb.width / 2,
      top: bb.top,
      bottom: bb.top + bb.height,
      centerY: bb.top + bb.height / 2,
    };

    const guidesV = [0, cw / 2, cw];
    const guidesH = [0, ch / 2, ch];

    let snappedX: number | null = null;
    let snappedY: number | null = null;

    for (const g of guidesV) {
      if (Math.abs(targets.left - g) < SNAP) {
        target.set({ left: target.left - (targets.left - g) });
        snappedX = g;
        break;
      }
      if (Math.abs(targets.centerX - g) < SNAP) {
        target.set({ left: target.left - (targets.centerX - g) });
        snappedX = g;
        break;
      }
      if (Math.abs(targets.right - g) < SNAP) {
        target.set({ left: target.left - (targets.right - g) });
        snappedX = g;
        break;
      }
    }
    for (const g of guidesH) {
      if (Math.abs(targets.top - g) < SNAP) {
        target.set({ top: target.top - (targets.top - g) });
        snappedY = g;
        break;
      }
      if (Math.abs(targets.centerY - g) < SNAP) {
        target.set({ top: target.top - (targets.centerY - g) });
        snappedY = g;
        break;
      }
      if (Math.abs(targets.bottom - g) < SNAP) {
        target.set({ top: target.top - (targets.bottom - g) });
        snappedY = g;
        break;
      }
    }

    if (snappedX !== null) {
      const l = new fabric.Line([snappedX, 0, snappedX, ch], {
        stroke: "#22d3ee",
        selectable: false,
        evented: false,
        strokeWidth: 1,
      });
      snapGuidesRef.current.push(l);
      canvas.add(l);
    }
    if (snappedY !== null) {
      const l = new fabric.Line([0, snappedY, cw, snappedY], {
        stroke: "#22d3ee",
        selectable: false,
        evented: false,
        strokeWidth: 1,
      });
      snapGuidesRef.current.push(l);
      canvas.add(l);
    }
  };

  /* ----------------------------- Layer ops ------------------------------- */

  const addLayerFromDataUrl = useCallback(
    async (dataUrl: string, name: string) => {
      const canvas = canvasRef.current;
      const fabric = fabricRef.current;
      if (!canvas || !fabric) return;
      const img = await fabric.FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" });
      const maxW = canvasSettings.width * 0.8;
      const maxH = canvasSettings.height * 0.8;
      const w = (img as any).width ?? 1;
      const h = (img as any).height ?? 1;
      const scale = Math.min(maxW / w, maxH / h, 1);
      img.set({
        left: canvasSettings.width / 2,
        top: canvasSettings.height / 2,
        originX: "center",
        originY: "center",
        scaleX: scale,
        scaleY: scale,
      });
      (img as any).layerId = uid();
      (img as any).layerName = name;
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.requestRenderAll();
      refreshLayers();
    },
    [canvasSettings.width, canvasSettings.height, refreshLayers],
  );

  const handleAddLayerClick = () => fileInputRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.type.startsWith("image/")) continue;
      const dataUrl = await fileToDataUrl(f);
      await addLayerFromDataUrl(dataUrl, f.name.replace(/\.[^.]+$/, ""));
    }
  };

  const setActiveLayer = (id: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obj = findObject(id);
    if (!obj) return;
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
  };

  const toggleVisible = (id: string) => {
    const obj = findObject(id);
    if (!obj) return;
    obj.visible = !obj.visible;
    canvasRef.current?.requestRenderAll();
    refreshLayers();
  };

  const toggleLocked = (id: string) => {
    const obj = findObject(id);
    if (!obj) return;
    const locked = !obj.lockMovementX;
    obj.lockMovementX = locked;
    obj.lockMovementY = locked;
    obj.lockRotation = locked;
    obj.lockScalingX = locked;
    obj.lockScalingY = locked;
    obj.selectable = !locked;
    canvasRef.current?.requestRenderAll();
    refreshLayers();
  };

  const deleteLayer = (id: string) => {
    const canvas = canvasRef.current;
    const obj = findObject(id);
    if (!canvas || !obj) return;
    canvas.remove(obj);
    canvas.requestRenderAll();
    refreshLayers();
  };

  const duplicateLayer = async (id: string) => {
    const canvas = canvasRef.current;
    const obj = findObject(id);
    if (!canvas || !obj) return;
    const cloned = await obj.clone();
    cloned.set({ left: obj.left + 20, top: obj.top + 20 });
    cloned.layerId = uid();
    cloned.layerName = (obj as any).layerName + " copy";
    canvas.add(cloned);
    canvas.setActiveObject(cloned);
    canvas.requestRenderAll();
    refreshLayers();
  };

  const renameLayer = (id: string, name: string) => {
    const obj = findObject(id);
    if (!obj) return;
    (obj as any).layerName = name;
    refreshLayers();
  };

  const moveLayer = (id: string, dir: "up" | "down") => {
    const canvas = canvasRef.current;
    const obj = findObject(id);
    if (!canvas || !obj) return;
    if (dir === "up") canvas.bringObjectForward(obj);
    else canvas.sendObjectBackwards(obj);
    canvas.requestRenderAll();
    refreshLayers();
  };

  const setLayerOpacity = (id: string, opacity: number) => {
    const obj = findObject(id);
    if (!obj) return;
    obj.set("opacity", opacity);
    canvasRef.current?.requestRenderAll();
  };

  /* ----------------------------- Eyedropper ------------------------------ */

  const sampleColor = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const lower = canvas.lowerCanvasEl as HTMLCanvasElement;
    const ctx = lower.getContext("2d");
    if (!ctx) return;
    const zoom = canvas.getZoom();
    const vpt = canvas.viewportTransform!;
    const px = Math.floor(x * zoom + vpt[4]);
    const py = Math.floor(y * zoom + vpt[5]);
    try {
      const data = ctx.getImageData(px, py, 1, 1).data;
      const hex =
        "#" +
        [data[0], data[1], data[2]].map(c => c.toString(16).padStart(2, "0")).join("");
      setBrush(b => ({ ...b, color: hex }));
      setTool("brush");
    } catch {
      /* ignore */
    }
  };

  /* ----------------------------- Outline gen ----------------------------- */

  const generateOutline = async (thickness: number, color: string) => {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return;
    const obj = canvas.getActiveObject();
    if (!obj || !(obj as any).getElement) return;
    setBusy("Generating outline…");
    try {
      const el: HTMLImageElement | HTMLCanvasElement = (obj as any).getElement();
      const w = (obj as any).width;
      const h = (obj as any).height;
      const pad = thickness + 2;
      const off = document.createElement("canvas");
      off.width = w + pad * 2;
      off.height = h + pad * 2;
      const ctx = off.getContext("2d")!;
      ctx.drawImage(el, pad, pad, w, h);
      const src = ctx.getImageData(0, 0, off.width, off.height);
      const dst = ctx.createImageData(off.width, off.height);
      const data = src.data;
      const out = dst.data;
      const t = Math.max(1, Math.floor(thickness));
      const t2 = t * t;
      const rgb = hexToRgb(color);
      // for each pixel, if alpha=0 and there's any opaque pixel within t, mark outline
      for (let y = 0; y < off.height; y++) {
        for (let x = 0; x < off.width; x++) {
          const idx = (y * off.width + x) * 4;
          if (data[idx + 3] > 8) continue; // skip already opaque
          let found = false;
          for (let dy = -t; dy <= t && !found; dy++) {
            for (let dx = -t; dx <= t && !found; dx++) {
              if (dx * dx + dy * dy > t2) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= off.width || ny >= off.height) continue;
              const nidx = (ny * off.width + nx) * 4;
              if (data[nidx + 3] > 32) {
                found = true;
              }
            }
          }
          if (found) {
            out[idx] = rgb.r;
            out[idx + 1] = rgb.g;
            out[idx + 2] = rgb.b;
            out[idx + 3] = 255;
          }
        }
      }
      ctx.putImageData(dst, 0, 0);
      const url = off.toDataURL("image/png");
      const outline = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      outline.set({
        left: obj.left,
        top: obj.top,
        originX: obj.originX,
        originY: obj.originY,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        angle: obj.angle,
      });
      (outline as any).layerId = uid();
      (outline as any).layerName = ((obj as any).layerName ?? "Layer") + " outline";
      canvas.add(outline);
      // place below source object
      const idx = canvas.getObjects().indexOf(obj);
      canvas.moveObjectTo(outline, Math.max(0, idx));
      canvas.requestRenderAll();
      refreshLayers();
    } finally {
      setBusy(null);
    }
  };

  const hexToRgb = (hex: string) => {
    const m = hex.replace("#", "");
    return {
      r: parseInt(m.slice(0, 2), 16),
      g: parseInt(m.slice(2, 4), 16),
      b: parseInt(m.slice(4, 6), 16),
    };
  };

  /* ----------------------------- Borders --------------------------------- */

  const addCanvasBorder = (thickness: number, color: string, opacity: number) => {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return;
    const rect = new fabric.Rect({
      left: thickness / 2,
      top: thickness / 2,
      width: canvasSettings.width - thickness,
      height: canvasSettings.height - thickness,
      fill: "transparent",
      stroke: color,
      strokeWidth: thickness,
      opacity,
      selectable: true,
    });
    (rect as any).layerId = uid();
    (rect as any).layerName = "Canvas border";
    canvas.add(rect);
    canvas.requestRenderAll();
    refreshLayers();
  };

  /* ----------------------------- Effects --------------------------------- */

  const applyGlow = (blur: number, opacity: number, color: string) => {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    const rgb = hexToRgb(color);
    obj.shadow = new fabric.Shadow({
      color: `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`,
      blur,
      offsetX: 0,
      offsetY: 0,
    });
    canvas.requestRenderAll();
  };

  const applyDropShadow = (offsetX: number, offsetY: number, blur: number, opacity: number, color: string) => {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    const rgb = hexToRgb(color);
    obj.shadow = new fabric.Shadow({
      color: `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`,
      blur,
      offsetX,
      offsetY,
    });
    canvas.requestRenderAll();
  };

  const clearEffects = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    obj.shadow = null;
    canvas.requestRenderAll();
  };

  /* ------------------------- Background removal -------------------------- */

  const removeBg = async () => {
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return;
    const obj = canvas.getActiveObject();
    if (!obj || !(obj as any).getElement) return;
    setBusy("Removing background… (first run downloads ~30MB WASM model)");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const el: HTMLImageElement | HTMLCanvasElement = (obj as any).getElement();
      // Render to a canvas to get an image blob
      const off = document.createElement("canvas");
      off.width = (obj as any).width;
      off.height = (obj as any).height;
      const ctx = off.getContext("2d")!;
      ctx.drawImage(el, 0, 0);
      const blob: Blob = await new Promise(res => off.toBlob(b => res(b!), "image/png"));
      const result = await removeBackground(blob);
      const url = URL.createObjectURL(result);
      const newImg = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      newImg.set({
        left: obj.left,
        top: obj.top,
        originX: obj.originX,
        originY: obj.originY,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        angle: obj.angle,
      });
      (newImg as any).layerId = (obj as any).layerId;
      (newImg as any).layerName = (obj as any).layerName;
      const idx = canvas.getObjects().indexOf(obj);
      canvas.remove(obj);
      canvas.add(newImg);
      canvas.moveObjectTo(newImg, idx);
      canvas.setActiveObject(newImg);
      canvas.requestRenderAll();
      refreshLayers();
    } catch (err) {
      console.error(err);
      alert("Background removal failed: " + (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /* ----------------------------- Export ---------------------------------- */

  const exportCanvas = (format: "png" | "jpeg" | "transparent-png") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    clearSnapGuides();
    const fmt = format === "jpeg" ? "jpeg" : "png";
    const wasBg = canvas.backgroundColor;
    if (format === "transparent-png") canvas.backgroundColor = undefined;
    const url = canvas.toDataURL({ format: fmt, multiplier: 1 });
    if (format === "transparent-png") canvas.backgroundColor = wasBg;
    triggerDownload(url, `nft-export.${fmt === "jpeg" ? "jpg" : "png"}`);
  };

  const exportSelected = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj) return;
    const url = obj.toDataURL({ format: "png", multiplier: 1 });
    triggerDownload(url, ((obj as any).layerName ?? "layer") + ".png");
  };

  const exportAllLayers = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const objs = canvas.getObjects().filter((o: any) => o.layerId && o.layerId !== "__grid__");
    objs.forEach((o: any, i: number) => {
      const url = o.toDataURL({ format: "png", multiplier: 1 });
      setTimeout(() => triggerDownload(url, (o.layerName ?? `layer-${i}`) + ".png"), i * 150);
    });
  };

  /* ----------------------------- Project I/O ----------------------------- */

  const saveProject = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const objs = canvas.getObjects().filter((o: any) => o.layerId && o.layerId !== "__grid__");
    const serial: SerializedLayer[] = [];
    for (let i = 0; i < objs.length; i++) {
      const o: any = objs[i];
      // produce a PNG of just this object
      const url = o.toDataURL({ format: "png", multiplier: 1 });
      serial.push({
        id: o.layerId,
        name: o.layerName ?? `Layer ${i + 1}`,
        visible: o.visible !== false,
        locked: !!o.lockMovementX,
        opacity: o.opacity ?? 1,
        left: o.left,
        top: o.top,
        scaleX: o.scaleX,
        scaleY: o.scaleY,
        angle: o.angle,
        width: o.width,
        height: o.height,
        zIndex: i,
        dataUrl: url,
      });
    }
    const project: ProjectFile = {
      version: 1,
      canvas: canvasSettings,
      layers: serial,
    };
    const blob = new Blob([JSON.stringify(project)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, "project.nfts");
  };

  const loadProject = async (file: File) => {
    const text = await file.text();
    const project: ProjectFile = JSON.parse(text);
    const canvas = canvasRef.current;
    const fabric = fabricRef.current;
    if (!canvas || !fabric) return;
    // clear existing
    canvas.getObjects().slice().forEach((o: any) => {
      if (o.layerId && o.layerId !== "__grid__") canvas.remove(o);
    });
    setCanvasSettings(project.canvas);
    for (const layer of project.layers) {
      const img = await fabric.FabricImage.fromURL(layer.dataUrl, { crossOrigin: "anonymous" });
      img.set({
        left: layer.left,
        top: layer.top,
        scaleX: layer.scaleX,
        scaleY: layer.scaleY,
        angle: layer.angle,
        opacity: layer.opacity,
        visible: layer.visible,
      });
      if (layer.locked) {
        img.lockMovementX = true;
        img.lockMovementY = true;
        img.lockRotation = true;
        img.lockScalingX = true;
        img.lockScalingY = true;
        img.selectable = false;
      }
      (img as any).layerId = layer.id;
      (img as any).layerName = layer.name;
      canvas.add(img);
    }
    canvas.requestRenderAll();
    refreshLayers();
  };

  /* ----------------------------- UI --------------------------------------- */

  const activeLayer = useMemo(() => layers.find(l => l.id === activeId), [layers, activeId]);

  return (
    <div className="flex flex-col h-screen w-screen bg-base-200 text-base-content">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* Left toolbar */}
        <aside className="w-14 bg-base-300/70 border-r border-base-content/10 flex flex-col items-center py-3 gap-1 shrink-0">
          <ToolButton
            active={tool === "select"}
            onClick={() => setTool("select")}
            label="Select / Move"
            icon={<CursorArrowRaysIcon className="h-5 w-5" />}
          />
          <ToolButton
            active={tool === "brush"}
            onClick={() => setTool("brush")}
            label="Brush"
            icon={<PaintBrushIcon className="h-5 w-5" />}
          />
          <ToolButton
            active={tool === "eraser"}
            onClick={() => setTool("eraser")}
            label="Eraser"
            icon={
              <span className="inline-block w-5 h-5 border-2 border-current rounded-sm rotate-12" />
            }
          />
          <ToolButton
            active={tool === "eyedropper"}
            onClick={() => setTool("eyedropper")}
            label="Color picker"
            icon={<SwatchIcon className="h-5 w-5" />}
          />
          <div className="h-px w-8 bg-base-content/10 my-2" />
          <ToolButton
            onClick={handleAddLayerClick}
            label="Add image layer"
            icon={<PhotoIcon className="h-5 w-5" />}
          />
          <ToolButton
            onClick={() =>
              setCanvasSettings(c => ({ ...c, showGrid: !c.showGrid }))
            }
            active={canvasSettings.showGrid}
            label="Toggle grid"
            icon={<Squares2X2Icon className="h-5 w-5" />}
          />
          <ToolButton
            onClick={fitToViewport}
            label="Fit to viewport"
            icon={<ViewfinderCircleIcon className="h-5 w-5" />}
          />
        </aside>

        {/* Center canvas */}
        <main
          ref={wrapperRef}
          className="relative flex-1 overflow-hidden"
          style={{
            backgroundImage:
              "linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.04) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.04) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.04) 75%)",
            backgroundSize: "24px 24px",
            backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
          }}
        >
          <canvas ref={canvasElRef} className="block" />

          {busy && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-30">
              <div className="bg-base-300 rounded-lg px-6 py-4 flex items-center gap-3 shadow-2xl">
                <span className="loading loading-spinner" />
                <span>{busy}</span>
              </div>
            </div>
          )}

          {/* Zoom indicator */}
          <div className="absolute bottom-3 left-3 text-xs px-2 py-1 rounded bg-base-300/80 backdrop-blur">
            {(zoom * 100).toFixed(0)}%
          </div>

          {ready ? null : (
            <div className="absolute inset-0 flex items-center justify-center text-sm opacity-70">
              Initializing canvas…
            </div>
          )}
        </main>

        {/* Right panel */}
        <aside className="w-80 bg-base-300/70 border-l border-base-content/10 flex flex-col shrink-0">
          <div className="overflow-y-auto flex-1">
            <Section title="Canvas">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex flex-col gap-1">
                  <span>Width</span>
                  <input
                    type="number"
                    className="input input-xs input-bordered"
                    value={canvasSettings.width}
                    onChange={e =>
                      setCanvasSettings(c => ({ ...c, width: Math.max(1, +e.target.value || 1) }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Height</span>
                  <input
                    type="number"
                    className="input input-xs input-bordered"
                    value={canvasSettings.height}
                    onChange={e =>
                      setCanvasSettings(c => ({ ...c, height: Math.max(1, +e.target.value || 1) }))
                    }
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 mt-2 text-xs">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={canvasSettings.transparent}
                  onChange={e =>
                    setCanvasSettings(c => ({ ...c, transparent: e.target.checked }))
                  }
                />
                <span>Transparent background</span>
              </label>
              {!canvasSettings.transparent && (
                <label className="flex items-center gap-2 mt-2 text-xs">
                  <span>Bg color</span>
                  <input
                    type="color"
                    value={canvasSettings.backgroundColor}
                    onChange={e =>
                      setCanvasSettings(c => ({ ...c, backgroundColor: e.target.value }))
                    }
                  />
                </label>
              )}
            </Section>

            <Section title="Layers" sticky>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs opacity-70">{layers.length} layer(s)</span>
                <button className="btn btn-xs btn-primary gap-1" onClick={handleAddLayerClick}>
                  <PlusIcon className="h-3 w-3" /> Add
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {[...layers].reverse().map(l => (
                  <LayerRow
                    key={l.id}
                    layer={l}
                    active={activeId === l.id}
                    renaming={renamingId === l.id}
                    onSelect={() => setActiveLayer(l.id)}
                    onToggleVisible={() => toggleVisible(l.id)}
                    onToggleLocked={() => toggleLocked(l.id)}
                    onDelete={() => deleteLayer(l.id)}
                    onDuplicate={() => duplicateLayer(l.id)}
                    onMoveUp={() => moveLayer(l.id, "up")}
                    onMoveDown={() => moveLayer(l.id, "down")}
                    onStartRename={() => setRenamingId(l.id)}
                    onRename={name => {
                      renameLayer(l.id, name);
                      setRenamingId(null);
                    }}
                    onCancelRename={() => setRenamingId(null)}
                  />
                ))}
                {layers.length === 0 && (
                  <div className="text-xs opacity-60 italic text-center py-4">
                    No layers yet — click <span className="font-bold">Add</span> to upload images.
                  </div>
                )}
              </div>
            </Section>

            {(tool === "brush" || tool === "eraser") && (
              <Section title={tool === "brush" ? "Brush" : "Eraser"}>
                <SliderRow
                  label="Size"
                  min={1}
                  max={200}
                  step={1}
                  value={brush.size}
                  onChange={v => setBrush(b => ({ ...b, size: v }))}
                />
                <SliderRow
                  label="Opacity"
                  min={0}
                  max={1}
                  step={0.01}
                  value={brush.opacity}
                  onChange={v => setBrush(b => ({ ...b, opacity: v }))}
                />
                <SliderRow
                  label="Softness"
                  min={0}
                  max={1}
                  step={0.01}
                  value={brush.softness}
                  onChange={v => setBrush(b => ({ ...b, softness: v }))}
                />
                <div className="flex items-center gap-2 mt-2 text-xs">
                  <span>Shape</span>
                  <div className="join">
                    <button
                      className={`join-item btn btn-xs ${brush.shape === "round" ? "btn-active" : ""}`}
                      onClick={() => setBrush(b => ({ ...b, shape: "round" }))}
                    >
                      Round
                    </button>
                    <button
                      className={`join-item btn btn-xs ${brush.shape === "square" ? "btn-active" : ""}`}
                      onClick={() => setBrush(b => ({ ...b, shape: "square" }))}
                    >
                      Square
                    </button>
                  </div>
                </div>
                {tool === "brush" && (
                  <label className="flex items-center gap-2 mt-2 text-xs">
                    <span>Color</span>
                    <input
                      type="color"
                      value={brush.color}
                      onChange={e => setBrush(b => ({ ...b, color: e.target.value }))}
                    />
                    <span className="font-mono opacity-70">{brush.color}</span>
                  </label>
                )}
              </Section>
            )}

            {activeLayer && (
              <Section title="Layer Properties">
                <LayerProperties
                  layerId={activeLayer.id}
                  findObject={findObject}
                  setLayerOpacity={setLayerOpacity}
                  canvas={canvasRef.current}
                />
              </Section>
            )}

            <Section title="Outline" defaultOpen={false}>
              <OutlinePanel onApply={(t, c) => generateOutline(t, c)} disabled={!activeLayer} />
            </Section>

            <Section title="Border" defaultOpen={false}>
              <BorderPanel
                onApply={(t, c, o) => addCanvasBorder(t, c, o)}
              />
            </Section>

            <Section title="Effects" defaultOpen={false}>
              <EffectsPanel
                onGlow={applyGlow}
                onShadow={applyDropShadow}
                onClear={clearEffects}
                disabled={!activeLayer}
              />
            </Section>

            <Section title="AI / Background" defaultOpen={false}>
              <button
                className="btn btn-sm btn-primary w-full gap-2"
                onClick={removeBg}
                disabled={!activeLayer || !!busy}
              >
                <SparklesIcon className="h-4 w-4" />
                Remove background
              </button>
              <p className="text-[10px] opacity-60 mt-2 leading-snug">
                Uses @imgly/background-removal in your browser. The model (~30MB) downloads on first
                use and is cached.
              </p>
            </Section>

            <Section title="Export" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-xs" onClick={() => exportCanvas("png")}>
                  <ArrowDownTrayIcon className="h-3 w-3" /> PNG
                </button>
                <button className="btn btn-xs" onClick={() => exportCanvas("jpeg")}>
                  <ArrowDownTrayIcon className="h-3 w-3" /> JPG
                </button>
                <button
                  className="btn btn-xs col-span-2"
                  onClick={() => exportCanvas("transparent-png")}
                >
                  <ArrowDownTrayIcon className="h-3 w-3" /> Transparent PNG
                </button>
                <button
                  className="btn btn-xs col-span-2"
                  onClick={exportSelected}
                  disabled={!activeLayer}
                >
                  <ArrowDownTrayIcon className="h-3 w-3" /> Export selected layer
                </button>
                <button className="btn btn-xs col-span-2" onClick={exportAllLayers}>
                  <ArrowDownTrayIcon className="h-3 w-3" /> Export all layers
                </button>
              </div>
            </Section>

            <Section title="Project" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-xs" onClick={saveProject}>
                  <FolderArrowDownIcon className="h-3 w-3" /> Save .nfts
                </button>
                <button
                  className="btn btn-xs"
                  onClick={() => projectInputRef.current?.click()}
                >
                  <FolderOpenIcon className="h-3 w-3" /> Load .nfts
                </button>
              </div>
            </Section>
          </div>
        </aside>
      </div>

      <Footer />

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept=".nfts,application/json"
        hidden
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) loadProject(f);
          e.target.value = "";
        }}
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Subcomponents                                                             */
/* -------------------------------------------------------------------------- */

const ToolButton: React.FC<{
  active?: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}> = ({ active, label, icon, onClick }) => (
  <button
    title={label}
    onClick={onClick}
    className={`w-10 h-10 rounded-md flex items-center justify-center transition-colors ${
      active ? "bg-primary/30 text-base-content" : "hover:bg-base-content/10 opacity-80"
    }`}
  >
    {icon}
  </button>
);

const Section: React.FC<{
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  sticky?: boolean;
}> = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-base-content/10">
      <button
        className="w-full text-left px-3 py-2 flex justify-between items-center hover:bg-base-content/5"
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-semibold text-xs uppercase tracking-wider opacity-80">{title}</span>
        <span className="text-xs opacity-60">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
};

const SliderRow: React.FC<{
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}> = ({ label, min, max, step, value, onChange }) => (
  <div className="flex items-center gap-2 mb-1 text-xs">
    <span className="w-16 opacity-70">{label}</span>
    <input
      type="range"
      className="range range-xs flex-1"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(+e.target.value)}
    />
    <span className="w-10 text-right font-mono opacity-80">
      {step < 1 ? value.toFixed(2) : value}
    </span>
  </div>
);

const LayerRow: React.FC<{
  layer: LayerMeta;
  active: boolean;
  renaming: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onToggleLocked: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
}> = ({
  layer,
  active,
  renaming,
  onSelect,
  onToggleVisible,
  onToggleLocked,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onStartRename,
  onRename,
  onCancelRename,
}) => {
  const [tempName, setTempName] = useState(layer.name);
  useEffect(() => setTempName(layer.name), [layer.name, renaming]);
  return (
    <div
      className={`flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer text-xs ${
        active ? "bg-primary/30" : "hover:bg-base-content/5"
      }`}
      onClick={onSelect}
      onDoubleClick={onStartRename}
    >
      <button
        className="opacity-80 hover:opacity-100 p-0.5"
        onClick={e => {
          e.stopPropagation();
          onToggleVisible();
        }}
        title={layer.visible ? "Hide" : "Show"}
      >
        {layer.visible ? <EyeIcon className="h-3.5 w-3.5" /> : <EyeSlashIcon className="h-3.5 w-3.5" />}
      </button>
      <button
        className="opacity-80 hover:opacity-100 p-0.5"
        onClick={e => {
          e.stopPropagation();
          onToggleLocked();
        }}
        title={layer.locked ? "Unlock" : "Lock"}
      >
        {layer.locked ? <LockClosedIcon className="h-3.5 w-3.5" /> : <LockOpenIcon className="h-3.5 w-3.5" />}
      </button>
      {renaming ? (
        <input
          autoFocus
          className="input input-xs flex-1 h-6 px-1 text-xs"
          value={tempName}
          onChange={e => setTempName(e.target.value)}
          onBlur={() => onRename(tempName)}
          onKeyDown={e => {
            if (e.key === "Enter") onRename(tempName);
            if (e.key === "Escape") onCancelRename();
          }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate">{layer.name}</span>
      )}
      <button
        className="opacity-60 hover:opacity-100 p-0.5"
        title="Move up"
        onClick={e => {
          e.stopPropagation();
          onMoveUp();
        }}
      >
        <ArrowUturnLeftIcon className="h-3 w-3 rotate-90" />
      </button>
      <button
        className="opacity-60 hover:opacity-100 p-0.5"
        title="Move down"
        onClick={e => {
          e.stopPropagation();
          onMoveDown();
        }}
      >
        <ArrowUturnRightIcon className="h-3 w-3 rotate-90" />
      </button>
      <button
        className="opacity-60 hover:opacity-100 p-0.5"
        title="Duplicate"
        onClick={e => {
          e.stopPropagation();
          onDuplicate();
        }}
      >
        <DocumentArrowUpIcon className="h-3 w-3" />
      </button>
      <button
        className="opacity-60 hover:opacity-100 p-0.5 text-error"
        title="Delete"
        onClick={e => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <TrashIcon className="h-3 w-3" />
      </button>
    </div>
  );
};

const LayerProperties: React.FC<{
  layerId: string;
  findObject: (id: string) => any;
  setLayerOpacity: (id: string, opacity: number) => void;
  canvas: any;
}> = ({ layerId, findObject, setLayerOpacity, canvas }) => {
  const obj = findObject(layerId);
  const [opacity, setOpacity] = useState(obj?.opacity ?? 1);
  const [angle, setAngle] = useState(obj?.angle ?? 0);
  useEffect(() => {
    if (obj) {
      setOpacity(obj.opacity ?? 1);
      setAngle(obj.angle ?? 0);
    }
  }, [obj, layerId]);
  if (!obj) return null;
  return (
    <div>
      <SliderRow
        label="Opacity"
        min={0}
        max={1}
        step={0.01}
        value={opacity}
        onChange={v => {
          setOpacity(v);
          setLayerOpacity(layerId, v);
        }}
      />
      <SliderRow
        label="Rotation"
        min={-180}
        max={180}
        step={1}
        value={angle}
        onChange={v => {
          setAngle(v);
          obj.set("angle", v);
          canvas?.requestRenderAll();
        }}
      />
      <button
        className="btn btn-xs btn-block mt-2 gap-1"
        onClick={() => {
          obj.center();
          canvas?.requestRenderAll();
        }}
      >
        <ArrowsPointingOutIcon className="h-3 w-3" />
        Center on canvas
      </button>
    </div>
  );
};

const OutlinePanel: React.FC<{
  onApply: (thickness: number, color: string) => void;
  disabled: boolean;
}> = ({ onApply, disabled }) => {
  const [thickness, setThickness] = useState(6);
  const [color, setColor] = useState("#ffffff");
  return (
    <div>
      <SliderRow label="Thickness" min={1} max={40} step={1} value={thickness} onChange={setThickness} />
      <label className="flex items-center gap-2 text-xs my-1">
        <span className="w-16 opacity-70">Color</span>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} />
        <span className="font-mono opacity-70">{color}</span>
      </label>
      <button
        className="btn btn-sm btn-primary w-full mt-2"
        onClick={() => onApply(thickness, color)}
        disabled={disabled}
      >
        Generate outline layer
      </button>
      <p className="text-[10px] opacity-60 mt-2 leading-snug">
        Expands the alpha edge of the selected image outward. Best on transparent PNGs.
      </p>
    </div>
  );
};

const BorderPanel: React.FC<{
  onApply: (thickness: number, color: string, opacity: number) => void;
}> = ({ onApply }) => {
  const [thickness, setThickness] = useState(20);
  const [color, setColor] = useState("#ffffff");
  const [opacity, setOpacity] = useState(1);
  return (
    <div>
      <SliderRow label="Thickness" min={1} max={100} step={1} value={thickness} onChange={setThickness} />
      <SliderRow label="Opacity" min={0} max={1} step={0.01} value={opacity} onChange={setOpacity} />
      <label className="flex items-center gap-2 text-xs my-1">
        <span className="w-16 opacity-70">Color</span>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} />
      </label>
      <button
        className="btn btn-sm btn-primary w-full mt-2"
        onClick={() => onApply(thickness, color, opacity)}
      >
        Add canvas border
      </button>
    </div>
  );
};

const EffectsPanel: React.FC<{
  onGlow: (blur: number, opacity: number, color: string) => void;
  onShadow: (offsetX: number, offsetY: number, blur: number, opacity: number, color: string) => void;
  onClear: () => void;
  disabled: boolean;
}> = ({ onGlow, onShadow, onClear, disabled }) => {
  const [glowBlur, setGlowBlur] = useState(20);
  const [glowOpacity, setGlowOpacity] = useState(0.7);
  const [glowColor, setGlowColor] = useState("#22d3ee");
  const [sx, setSx] = useState(8);
  const [sy, setSy] = useState(8);
  const [sBlur, setSBlur] = useState(15);
  const [sOpacity, setSOpacity] = useState(0.5);
  const [sColor, setSColor] = useState("#000000");
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold opacity-80 mb-1">Outer glow</p>
        <SliderRow label="Blur" min={0} max={80} step={1} value={glowBlur} onChange={setGlowBlur} />
        <SliderRow
          label="Opacity"
          min={0}
          max={1}
          step={0.01}
          value={glowOpacity}
          onChange={setGlowOpacity}
        />
        <label className="flex items-center gap-2 text-xs my-1">
          <span className="w-16 opacity-70">Color</span>
          <input type="color" value={glowColor} onChange={e => setGlowColor(e.target.value)} />
        </label>
        <button
          className="btn btn-xs btn-block btn-primary mt-1"
          onClick={() => onGlow(glowBlur, glowOpacity, glowColor)}
          disabled={disabled}
        >
          Apply glow
        </button>
      </div>
      <div>
        <p className="text-xs font-semibold opacity-80 mb-1">Drop shadow</p>
        <SliderRow label="Offset X" min={-100} max={100} step={1} value={sx} onChange={setSx} />
        <SliderRow label="Offset Y" min={-100} max={100} step={1} value={sy} onChange={setSy} />
        <SliderRow label="Blur" min={0} max={80} step={1} value={sBlur} onChange={setSBlur} />
        <SliderRow
          label="Opacity"
          min={0}
          max={1}
          step={0.01}
          value={sOpacity}
          onChange={setSOpacity}
        />
        <label className="flex items-center gap-2 text-xs my-1">
          <span className="w-16 opacity-70">Color</span>
          <input type="color" value={sColor} onChange={e => setSColor(e.target.value)} />
        </label>
        <button
          className="btn btn-xs btn-block btn-primary mt-1"
          onClick={() => onShadow(sx, sy, sBlur, sOpacity, sColor)}
          disabled={disabled}
        >
          Apply drop shadow
        </button>
      </div>
      <button className="btn btn-xs btn-block btn-ghost" onClick={onClear} disabled={disabled}>
        Clear effects
      </button>
    </div>
  );
};

export default NftStudio;
