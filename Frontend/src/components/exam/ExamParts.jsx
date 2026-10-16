import React, { memo, useEffect, useRef } from "react";
import { isAnsweredValue } from "../../utils/examAnswers";

/**
 * Pieces of the MCQ / theory exam screen (pages/TakeTest.jsx).
 *
 * The exam page re-renders every second for the countdown. The parts here are
 * memoised and receive only props that change when the student does
 * something, so a tick redraws the timer and nothing else -- on a slow lab
 * laptop, re-rendering a 100-button palette and every option card once a
 * second is what makes clicks feel sticky.
 */

/**
 * Styles the exam screen needs beyond utility classes: the question fade, thin
 * scrollbars, and the timer pulse. Motion is dropped for anyone who asks the
 * operating system for reduced motion.
 */
export function ExamStyles() {
  return (
    <style>{`
      @keyframes exam-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      .exam-enter { animation: exam-enter 220ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      @keyframes exam-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.0); } 50% { box-shadow: 0 0 0 6px rgba(244, 63, 94, 0.18); } }
      .exam-timer-critical { animation: exam-pulse 1.2s ease-in-out infinite; }
      .exam-scroll { scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.22) transparent; }
      .exam-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
      .exam-scroll::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.18); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
      .exam-scroll::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.32); background-clip: padding-box; border: 3px solid transparent; }
      .exam-scroll::-webkit-scrollbar-track { background: transparent; }
      @media (prefers-reduced-motion: reduce) {
        .exam-enter, .exam-timer-critical { animation: none; }
      }
    `}</style>
  );
}

/** The options of one MCQ. Re-renders only when the question or its answer changes. */
export const McqOptions = memo(function McqOptions({ question, selected, number, onSelect }) {
  return (
    <div role="radiogroup" aria-label={`Question ${number} options`} className="space-y-3">
      {question.options?.map((option, index) => {
        const isSelected = selected === index;
        return (
          <label
            key={index}
            className={`group flex cursor-pointer items-center gap-4 rounded-xl px-5 py-4 ring-1 transition-[background-color,box-shadow] duration-150 ease-out focus-within:ring-2 focus-within:ring-white/50 ${
              isSelected
                ? "bg-white/[0.06] ring-2 ring-white/85"
                : "bg-white/[0.02] ring-white/[0.08] hover:bg-white/[0.045] hover:ring-white/[0.16]"
            }`}
          >
            <input
              type="radio"
              name={`question-${question._id}`}
              value={index}
              checked={isSelected}
              onChange={() => onSelect(question._id, index)}
              className="sr-only"
            />
            <span
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-semibold transition-colors duration-150 ${
                isSelected
                  ? "bg-white text-slate-900 shadow-[0_0_0_4px_rgba(255,255,255,0.10)]"
                  : "bg-white/[0.04] text-slate-400 ring-1 ring-white/10 group-hover:text-slate-200"
              }`}
            >
              {String.fromCharCode(65 + index)}
            </span>
            <span className={`flex-1 text-[0.975rem] leading-relaxed xl:text-base 2xl:text-[1.0625rem] ${isSelected ? "text-white" : "text-slate-200"}`}>
              {option.text}
            </span>
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-all duration-150 ${
                isSelected ? "scale-100 bg-white opacity-100" : "scale-75 opacity-0"
              }`}
            >
              <svg className="h-3 w-3 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
          </label>
        );
      })}
    </div>
  );
});

/**
 * The question navigator: counts, the numbered grid and its legend.
 * Keeps the current question in view as the student moves through a long paper.
 */
export const QuestionNavigator = memo(function QuestionNavigator({ questions, current, statuses, answers, onNavigate }) {
  const gridRef = useRef(null);

  useEffect(() => {
    gridRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView?.({ block: "nearest" });
  }, [current]);

  const total = questions.length;
  let answered = 0;
  let marked = 0;
  for (const q of questions) {
    if (isAnsweredValue(q, answers[q._id])) answered++;
    if (statuses[q._id] === "mark-for-review") marked++;
  }
  const percent = total ? Math.round((answered / total) * 100) : 0;

  return (
    <>
      <div className="flex-shrink-0 px-6 pt-6 pb-5 [@media(max-height:760px)]:pt-4 [@media(max-height:760px)]:pb-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Questions</h2>
          <span className="text-xs tabular-nums text-slate-400">
            <span className="font-semibold text-slate-200">{answered}</span> of {total} answered
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-slate-200 to-emerald-400 transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-white/[0.03] px-2 py-2 ring-1 ring-white/[0.06]">
            <dt className="text-[11px] text-slate-400">Answered</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-emerald-300">{answered}</dd>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-2 py-2 ring-1 ring-white/[0.06]">
            <dt className="text-[11px] text-slate-400">Remaining</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-100">{total - answered}</dd>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-2 py-2 ring-1 ring-white/[0.06]">
            <dt className="text-[11px] text-slate-400">For review</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-amber-300">{marked}</dd>
          </div>
        </dl>
      </div>

      <div className="h-px flex-shrink-0 bg-white/[0.06]" />

      {/* Scrolls on its own in whatever height is left, so no row is ever cut off. */}
      <div ref={gridRef} className="exam-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2.5">
          {questions.map((q, index) => {
            const isCurrent = current === index;
            const isMarked = statuses[q._id] === "mark-for-review";
            const hasAnswer = isAnsweredValue(q, answers[q._id]);
            const tone = isMarked
              ? "bg-amber-400/[0.14] text-amber-200 ring-1 ring-amber-400/50 hover:bg-amber-400/[0.2]"
              : hasAnswer
                ? "bg-emerald-500/90 text-emerald-950 hover:bg-emerald-400"
                : "bg-white/[0.03] text-slate-300 ring-1 ring-white/10 hover:bg-white/[0.07] hover:text-white";
            return (
              <button
                key={q._id}
                type="button"
                onClick={() => onNavigate(index)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Question ${index + 1}${hasAnswer ? ", answered" : ""}${isMarked ? ", marked for review" : ""}`}
                className={`relative h-11 rounded-lg text-sm font-semibold tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${tone} ${
                  isCurrent ? "outline outline-2 outline-offset-2 outline-white" : ""
                }`}
              >
                {index + 1}
                {isMarked && hasAnswer && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#111724]" title="Answered" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px flex-shrink-0 bg-white/[0.06]" />

      {/* Bottom padding leaves room for the "Proctored" badge fixed in the corner. */}
      <div className="flex-shrink-0 px-6 pt-4 pb-14">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs text-slate-400">
          <li className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-emerald-500/90" />Answered</li>
          <li className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-white/[0.03] ring-1 ring-white/20" />Not answered</li>
          <li className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-amber-400/[0.14] ring-1 ring-amber-400/50" />For review</li>
          <li className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded outline outline-2 outline-offset-1 outline-white" />Current</li>
        </ul>
      </div>
    </>
  );
});

/** Full-screen loading / error state, in the exam's colours. */
export function ExamStatusScreen({ title, detail, tone = "loading", action }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0e17] px-6 text-slate-100">
      <div className="exam-enter w-full max-w-sm text-center">
        <ExamStyles />
        {tone === "loading" ? (
          <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-white/10 border-t-white" />
        ) : (
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 ring-1 ring-rose-400/30">
            <svg className="h-7 w-7 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
        )}
        <h1 className={`text-lg font-semibold ${tone === "loading" ? "text-slate-100" : "text-rose-200"}`}>{title}</h1>
        {detail && <p className="mt-2 text-sm leading-relaxed text-slate-400">{detail}</p>}
        {action && <div className="mt-7">{action}</div>}
      </div>
    </div>
  );
}
