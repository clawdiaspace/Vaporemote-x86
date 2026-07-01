import { useState, useRef, useCallback } from "react";
import { Wind, Play, Square, Plus, Trash2, Save, ChevronDown, ChevronUp, Edit2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadBalloonRoutines, saveBalloonRoutines } from "@/lib/stats";
import type { BalloonRoutine, BalloonStep } from "@/lib/stats";
import type { VaporizerCommand } from "@/lib/bluetooth";

interface Props {
  deviceId: string;
  connected: boolean;
  onSendCommand: (cmd: VaporizerCommand) => Promise<void>;
}

const STEP_LABELS: Record<BalloonStep["type"], string> = {
  pump_on: "Pump ON",
  pump_off: "Pump OFF",
  wait: "Wait",
};

const STEP_COLORS: Record<BalloonStep["type"], string> = {
  pump_on:  "bg-primary/20 border-primary/40 text-primary",
  pump_off: "bg-muted/40 border-border/40 text-muted-foreground",
  wait:     "bg-blue-500/10 border-blue-500/30 text-blue-400",
};

function formatDuration(s: number) {
  if (s === 0) return "instantly";
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

interface RunState {
  routineId: string;
  stepIndex: number;
  remaining: number;
}

export default function VolcanoRoutines({ deviceId, connected, onSendCommand }: Props) {
  const [routines, setRoutines] = useState<BalloonRoutine[]>(() => loadBalloonRoutines());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState | null>(null);
  const [building, setBuilding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRef = useRef(false);

  const stopRoutine = useCallback(() => {
    cancelRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRunState(null);
    // Explicitly turn fan OFF on stop (uses separate FAN_OFF characteristic)
    onSendCommand({ type: "toggle_fan" }).catch(() => {});
  }, [onSendCommand]);

  const runRoutine = useCallback(async (routine: BalloonRoutine) => {
    if (!connected) return;
    cancelRef.current = false;
    setRunState({ routineId: routine.id, stepIndex: 0, remaining: 0 });

    // Track logical fan state so pump_on/pump_off send to correct ON/OFF characteristic
    let fanIsOn = false;

    for (let i = 0; i < routine.steps.length; i++) {
      if (cancelRef.current) return;
      const step = routine.steps[i];
      setRunState({ routineId: routine.id, stepIndex: i, remaining: step.durationSeconds });

      if (step.type === "pump_on" && !fanIsOn) {
        await onSendCommand({ type: "toggle_fan" }); // adapter checks state → sends FAN_ON
        fanIsOn = true;
      } else if (step.type === "pump_off" && fanIsOn) {
        await onSendCommand({ type: "toggle_fan" }); // adapter checks state → sends FAN_OFF
        fanIsOn = false;
      }

      if (step.durationSeconds > 0) {
        await new Promise<void>((resolve) => {
          let remaining = step.durationSeconds;
          timerRef.current = setInterval(() => {
            if (cancelRef.current) {
              clearInterval(timerRef.current!);
              resolve();
              return;
            }
            remaining -= 1;
            setRunState({ routineId: routine.id, stepIndex: i, remaining });
            if (remaining <= 0) {
              clearInterval(timerRef.current!);
              resolve();
            }
          }, 1000);
        });
      }

      if (cancelRef.current) return;
    }

    setRunState(null);
  }, [connected, onSendCommand]);

  const isRunning = runState !== null;

  return (
    <div className="mt-4 pt-4 border-t border-border/30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wind size={14} className="text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-primary/90">Balloon Routinen</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1.5 hover:bg-primary/10 hover:text-primary"
          onClick={() => setBuilding(true)}
          disabled={isRunning}
        >
          <Plus size={12} /> Neu
        </Button>
      </div>

      {isRunning && (
        <ActiveRoutineBanner
          routine={routines.find(r => r.id === runState.routineId)!}
          runState={runState}
          onStop={stopRoutine}
        />
      )}

      <div className="space-y-2">
        {routines.map(routine => (
          <RoutineRow
            key={routine.id}
            routine={routine}
            expanded={expanded === routine.id}
            isRunning={isRunning}
            activeRoutineId={runState?.routineId ?? null}
            runStepIndex={runState?.routineId === routine.id ? runState.stepIndex : null}
            connected={connected}
            onToggle={() => setExpanded(prev => prev === routine.id ? null : routine.id)}
            onRun={() => runRoutine(routine)}
            onStop={stopRoutine}
            onEdit={() => setEditId(routine.id)}
            onDelete={() => {
              const updated = routines.filter(r => r.id !== routine.id);
              setRoutines(updated);
              saveBalloonRoutines(updated);
            }}
          />
        ))}
      </div>

      {building && (
        <RoutineBuilder
          onSave={(routine) => {
            const updated = [...routines, routine];
            setRoutines(updated);
            saveBalloonRoutines(updated);
            setBuilding(false);
          }}
          onCancel={() => setBuilding(false)}
        />
      )}

      {editId && (
        <RoutineBuilder
          initial={routines.find(r => r.id === editId)}
          onSave={(routine) => {
            const updated = routines.map(r => r.id === editId ? { ...routine, id: editId } : r);
            setRoutines(updated);
            saveBalloonRoutines(updated);
            setEditId(null);
          }}
          onCancel={() => setEditId(null)}
        />
      )}
    </div>
  );
}

function ActiveRoutineBanner({ routine, runState, onStop }: {
  routine: BalloonRoutine;
  runState: RunState;
  onStop: () => void;
}) {
  const step = routine?.steps[runState.stepIndex];
  if (!routine || !step) return null;
  return (
    <div className="mb-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
            {routine.name} — Schritt {runState.stepIndex + 1}/{routine.steps.length}
          </p>
          <p className="text-xs font-bold text-primary truncate">
            {STEP_LABELS[step.type]}
            {runState.remaining > 0 && <span className="ml-2 font-mono text-foreground">{runState.remaining}s</span>}
          </p>
        </div>
      </div>
      <Button size="sm" variant="destructive" className="h-7 px-2 shrink-0" onClick={onStop}>
        <Square size={12} className="mr-1" /> Stop
      </Button>
    </div>
  );
}

function RoutineRow({ routine, expanded, isRunning, activeRoutineId, runStepIndex, connected, onToggle, onRun, onStop, onEdit, onDelete }: {
  routine: BalloonRoutine;
  expanded: boolean;
  isRunning: boolean;
  activeRoutineId: string | null;
  runStepIndex: number | null;
  connected: boolean;
  onToggle: () => void;
  onRun: () => void;
  onStop: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isThisRunning = activeRoutineId === routine.id;
  const isBuiltin = routine.id.startsWith("builtin-");
  const totalDuration = routine.steps.reduce((s, st) => s + st.durationSeconds, 0);

  return (
    <div className="rounded-lg border border-border/30 bg-black/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onToggle} className="flex-1 flex items-center gap-2 text-left">
          {isThisRunning
            ? <ChevronDown size={12} className="text-primary shrink-0" />
            : expanded
              ? <ChevronDown size={12} className="text-muted-foreground shrink-0" />
              : <ChevronUp size={12} className="text-muted-foreground shrink-0 rotate-180" />
          }
          <span className="text-xs font-medium flex-1 truncate">{routine.name}</span>
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
            {routine.steps.length} Schr. · {formatDuration(totalDuration)}
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {!isBuiltin && !isThisRunning && (
            <>
              <Button size="icon" variant="ghost" className="h-6 w-6 hover:text-primary" onClick={onEdit}><Edit2 size={11} /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 hover:text-destructive" onClick={onDelete}><Trash2 size={11} /></Button>
            </>
          )}
          {isThisRunning ? (
            <Button size="sm" variant="destructive" className="h-6 px-2 text-[10px]" onClick={onStop}><Square size={10} className="mr-1" />Stop</Button>
          ) : (
            <Button
              size="sm"
              className="h-6 px-2 text-[10px] bg-primary/20 text-primary border border-primary/30 hover:bg-primary hover:text-primary-foreground"
              onClick={onRun}
              disabled={isRunning || !connected}
            >
              <Play size={10} className="mr-1" />Start
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-1 border-t border-border/20 pt-2">
          {routine.steps.map((step, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 rounded px-2 py-1 text-[10px] font-mono border transition-all ${
                isThisRunning && runStepIndex === i
                  ? "border-primary/60 bg-primary/15 text-primary font-bold"
                  : STEP_COLORS[step.type]
              }`}
            >
              <span className="opacity-50">{i + 1}.</span>
              <span className="flex-1">{step.label ?? STEP_LABELS[step.type]}</span>
              {step.durationSeconds > 0 && (
                <span className="flex items-center gap-1 opacity-70">
                  <Clock size={9} />{formatDuration(step.durationSeconds)}
                </span>
              )}
              {isThisRunning && runStepIndex === i && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoutineBuilder({ initial, onSave, onCancel }: {
  initial?: BalloonRoutine;
  onSave: (r: BalloonRoutine) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [steps, setSteps] = useState<BalloonStep[]>(
    initial?.steps ?? [
      { type: "pump_on",  durationSeconds: 30, label: "" },
      { type: "pump_off", durationSeconds: 0,  label: "" },
    ]
  );

  const addStep = (type: BalloonStep["type"]) => {
    setSteps(prev => [...prev, { type, durationSeconds: type === "pump_off" ? 0 : 15, label: "" }]);
  };

  const updateStep = (i: number, patch: Partial<BalloonStep>) => {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };

  const removeStep = (i: number) => {
    setSteps(prev => prev.filter((_, idx) => idx !== i));
  };

  const save = () => {
    if (!name.trim() || steps.length === 0) return;
    onSave({
      id: initial?.id ?? `custom-${Date.now()}`,
      name: name.trim(),
      steps,
      createdAt: initial?.createdAt ?? Date.now(),
    });
  };

  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-black/30 p-3 space-y-3">
      <p className="text-xs font-bold text-primary uppercase tracking-widest">{initial ? "Routine bearbeiten" : "Neue Routine"}</p>

      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Name</label>
        <input
          className="w-full bg-black/40 border border-border/40 rounded px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
          placeholder="z.B. Abend-Session"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider block">Schritte</label>
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select
              value={step.type}
              onChange={e => updateStep(i, { type: e.target.value as BalloonStep["type"] })}
              className="bg-black/40 border border-border/40 rounded px-1.5 py-1 text-[10px] text-foreground outline-none focus:border-primary/50"
            >
              <option value="pump_on">Pumpe AN</option>
              <option value="pump_off">Pumpe AUS</option>
              <option value="wait">Warten</option>
            </select>
            <input
              type="number"
              min={0}
              max={300}
              value={step.durationSeconds}
              onChange={e => updateStep(i, { durationSeconds: Number(e.target.value) })}
              className="w-14 bg-black/40 border border-border/40 rounded px-1.5 py-1 text-[10px] text-foreground outline-none focus:border-primary/50"
            />
            <span className="text-[10px] text-muted-foreground">s</span>
            <input
              placeholder="Label (optional)"
              value={step.label ?? ""}
              onChange={e => updateStep(i, { label: e.target.value })}
              className="flex-1 bg-black/40 border border-border/40 rounded px-1.5 py-1 text-[10px] text-foreground outline-none focus:border-primary/50"
            />
            <Button size="icon" variant="ghost" className="h-6 w-6 hover:text-destructive" onClick={() => removeStep(i)}>
              <Trash2 size={10} />
            </Button>
          </div>
        ))}
        <div className="flex gap-1.5 pt-1">
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] hover:text-primary hover:bg-primary/10" onClick={() => addStep("pump_on")}>
            + Pumpe AN
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] hover:text-primary hover:bg-primary/10" onClick={() => addStep("pump_off")}>
            + Pumpe AUS
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] hover:text-blue-400 hover:bg-blue-500/10" onClick={() => addStep("wait")}>
            + Warten
          </Button>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1 h-7 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={save}
          disabled={!name.trim() || steps.length === 0}
        >
          <Save size={11} /> Speichern
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>Abbrechen</Button>
      </div>
    </div>
  );
}
