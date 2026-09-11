import { createContext } from "react";

/**
 * The proctoring context lives in its own file on purpose.
 *
 * React Fast Refresh only works on a module that exports components and nothing
 * else, so keeping this alongside ProctorProvider would break hot reloading for
 * the whole exam page during development.
 *
 * Read it through `useProctor()` rather than consuming it directly.
 */
export const ProctorContext = createContext(null);
