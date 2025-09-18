import React, { Suspense } from 'react';

// Lazy load Monaco Editor only when needed
const MonacoEditor = React.lazy(() => import('@monaco-editor/react'));

const LazyMonacoEditor = (props) => {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 bg-slate-800 rounded-lg">
        <div className="text-slate-400">Loading editor...</div>
      </div>
    }>
      <MonacoEditor {...props} />
    </Suspense>
  );
};

export default LazyMonacoEditor;
