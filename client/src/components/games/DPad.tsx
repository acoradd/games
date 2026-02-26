import { useRef } from "react";

type Dir = "up" | "down" | "left" | "right";

/** True if the device has at least one touch point (phone, tablet, hybrid). */
export function isTouchDevice(): boolean {
    return navigator.maxTouchPoints > 0;
}

/**
 * Mobile D-pad overlay.
 * - Sends the direction immediately on pointer down.
 * - If repeatMs is provided, keeps sending at that interval while held (for Bomberman).
 * - touch-none prevents browser scroll/zoom from interfering.
 */
export default function DPad({ onDir, repeatMs }: {
    onDir:     (dir: Dir) => void;
    repeatMs?: number;
}) {
    const timerRef = useRef<number | null>(null);

    function start(dir: Dir) {
        onDir(dir);
        if (repeatMs) {
            timerRef.current = window.setInterval(() => onDir(dir), repeatMs);
        }
    }

    function stop() {
        if (timerRef.current !== null) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }

    function btn(dir: Dir, arrow: string) {
        return (
            <button
                onPointerDown={(e) => { e.preventDefault(); start(dir); }}
                onPointerUp={stop}
                onPointerLeave={stop}
                onPointerCancel={stop}
                className="w-12 h-12 rounded-xl bg-black/55 border border-white/20 text-white text-xl flex items-center justify-center active:bg-white/25 touch-none select-none"
            >
                {arrow}
            </button>
        );
    }

    return (
        <div className="grid grid-cols-3 gap-1">
            <div />{btn("up",    "▲")}<div />
            {btn("left", "◀")}<div />{btn("right", "▶")}
            <div />{btn("down",  "▼")}<div />
        </div>
    );
}
