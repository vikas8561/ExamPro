/**
 * The app's one syntax highlighter: Prism's light build with only the
 * languages a question or an answer can actually be written in.
 *
 * The default `Prism` export of react-syntax-highlighter bundles every grammar
 * Prism has -- around 300 of them -- into the main bundle, which every student
 * downloads before an exam can even start. A language not registered here is
 * shown as plain text rather than failing.
 */
import { PrismLight } from 'react-syntax-highlighter';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import kotlin from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';

const LANGUAGES = {
  bash, sh: bash, shell: bash,
  c,
  cpp, 'c++': cpp,
  csharp, cs: csharp,
  go, golang: go,
  java,
  javascript, js: javascript,
  json,
  kotlin,
  python, py: python,
  rust,
  sql,
  typescript, ts: typescript,
};

for (const [name, grammar] of Object.entries(LANGUAGES)) {
  PrismLight.registerLanguage(name, grammar);
}

export { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
export default PrismLight;
