/**
 * Monaco, bundled with the app and served from our own origin.
 *
 * `@monaco-editor/react` on its own fetches Monaco at runtime from
 * cdn.jsdelivr.net. Three things went wrong with that during exams:
 *
 *   - Safe Exam Browser's URL filter only allows the app and API hosts, so the
 *     CDN was blocked outright and the editor never appeared at all.
 *   - On a slow or filtered network (college Wi-Fi, ISPs that throttle or block
 *     jsdelivr) the ~4 MB of AMD modules arrived slowly or not at all.
 *   - The loader has no timeout and no retry. One failed request left its
 *     promise rejected (or pending) for the life of the page, so every editor
 *     sat on "Loading..." until the student reloaded -- which is why "start the
 *     test again" appeared to fix it.
 *
 * Importing it here makes it an ordinary hashed chunk of our own build, cached
 * immutably by the host like the rest of the app. Only the core editor and the
 * languages a test can be written in are included; the TypeScript, CSS, HTML
 * and JSON language services (several MB, and their own workers) are not.
 */
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main.js';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js'; // registers c and cpp
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { loader } from '@monaco-editor/react';

// The one worker the core editor uses (word suggestions, diffing, links). Built
// by Vite as a same-origin file, so neither a CDN nor a cross-origin worker
// shim is involved.
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// From here on `@monaco-editor/react` uses this instance and never injects the
// CDN loader script.
loader.config({ monaco });

export default monaco;
