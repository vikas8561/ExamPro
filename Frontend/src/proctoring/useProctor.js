import { useContext } from "react";
import { ProctorContext } from "./context";

/**
 * Read the proctoring state from an exam page.
 *
 * The field that matters most is `ready`. The server now withholds question
 * content until a proctoring session is actually running, so a page must wait
 * for `ready` before it fetches the paper:
 *
 *   const { ready, endSession } = useProctor();
 *   useEffect(() => { if (ready) loadQuestions(); }, [ready]);
 *
 * Outside a ProctorProvider this returns a safe inert object rather than
 * throwing, so a component can be rendered on an unproctored page — a practice
 * test, say — without needing to know whether proctoring is present.
 */
const INERT = {
  phase: "idle",
  ready: true,
  enabled: false,
  environment: null,
  readiness: { blockers: [], warnings: [], ready: true },
  session: null,
  policy: null,
  isSeb: false,
  violationCount: 0,
  limit: -1,
  warning: null,
  offline: false,
  startError: null,
  requestFullscreen: async () => false,
  exitFullscreen: async () => {},
  endSession: async () => {},
};

export function useProctor() {
  return useContext(ProctorContext) || INERT;
}

export default useProctor;
