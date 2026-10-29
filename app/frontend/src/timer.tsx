import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const KEY = "reps-rest-timer";

interface Timer {
  /** epoch ms when the rest ends; undefined = not running */
  endsAt?: number;
  /** what it was started for, e.g. the exercise name */
  label?: string;
  total: number;
}

interface TimerState extends Timer {
  remaining: number;
  done: boolean;
  start: (seconds: number, label?: string) => void;
  add: (seconds: number) => void;
  stop: () => void;
}

const Ctx = createContext<TimerState | null>(null);

export function useTimer(): TimerState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useTimer outside TimerProvider");
  return s;
}

function read(): Timer {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "") as Timer;
  } catch {
    return { total: 0 };
  }
}

function write(t: Timer) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* private mode */
  }
}

/** A short double beep (Web Audio, no sound file). */
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
  } catch {
    /* no audio */
  }
}

/** Rest timer: survives switching pages and reloading (it's just an end time). */
export function TimerProvider({ children }: { children: ReactNode }) {
  const [timer, setTimer] = useState<Timer>(read);
  const [now, setNow] = useState(Date.now());
  const [rang, setRang] = useState(false);

  useEffect(() => {
    if (!timer.endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [timer.endsAt]);

  const remaining = timer.endsAt ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : 0;
  const done = !!timer.endsAt && remaining === 0;

  useEffect(() => {
    if (done && !rang) {
      setRang(true);
      navigator.vibrate?.([300, 150, 300]);
      beep();
    }
  }, [done, rang]);

  const update = useCallback((t: Timer) => {
    write(t);
    setTimer(t);
    setNow(Date.now());
    setRang(false);
  }, []);

  const value = useMemo<TimerState>(
    () => ({
      ...timer,
      remaining,
      done,
      start: (seconds, label) => update({ endsAt: Date.now() + seconds * 1000, total: seconds, label }),
      add: (seconds) => {
        if (!timer.endsAt) return;
        const base = Math.max(timer.endsAt, Date.now());
        update({
          ...timer,
          endsAt: Math.max(Date.now(), base + seconds * 1000),
          total: Math.max(0, timer.total + seconds),
        });
      },
      stop: () => update({ total: 0 }),
    }),
    [timer, remaining, done, update],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
