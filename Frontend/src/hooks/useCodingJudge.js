import { useCallback, useState } from 'react';
import apiRequest, { apiStream } from '../services/api';

/**
 * Judge0 execution for an exam page: Run against the visible test cases, and
 * Submit against the hidden ones (which is what records the score).
 *
 * Owned by the page rather than by the workspace, and kept per question, so a
 * student's results survive switching to another question -- including, in an
 * MCQ + Coding test, an MCQ that unmounts the workspace entirely.
 */
export default function useCodingJudge(assignmentId) {
  const [runResultsByQ, setRunResultsByQ] = useState({});
  const [submitResultsByQ, setSubmitResultsByQ] = useState({});
  const [lastActionByQ, setLastActionByQ] = useState({}); // 'run' | 'submit'
  const [customInputByQ, setCustomInputByQ] = useState({});
  const [judgeBusy, setJudgeBusy] = useState(null); // 'run' | 'submit' | null
  const [judgeError, setJudgeError] = useState('');
  const [submitProgress, setSubmitProgress] = useState(null); // live judge progress

  const setCustomInput = useCallback((questionId, value) => {
    setCustomInputByQ((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  /**
   * Send one question's code to Judge0. Resolves once the result (or the error)
   * is in state; it never throws.
   */
  const execute = useCallback(async ({ mode, question, code, language }) => {
    if (!question || judgeBusy) return;

    const sourceCode = code || '';
    if (!sourceCode.trim()) {
      setJudgeError('Write some code before running it.');
      return;
    }

    const questionId = question._id;
    const payload = {
      assignmentId,
      questionId,
      sourceCode,
      language: language || 'python',
    };

    setJudgeBusy(mode);
    setJudgeError('');

    if (mode === 'run') {
      const customInput = customInputByQ[questionId] || '';
      try {
        const result = await apiRequest('/coding/run', {
          method: 'POST',
          body: JSON.stringify({ ...payload, ...(customInput ? { customInput } : {}) }),
        });
        setRunResultsByQ((prev) => ({ ...prev, [questionId]: result }));
        setLastActionByQ((prev) => ({ ...prev, [questionId]: 'run' }));
      } catch (error) {
        setJudgeError(error?.message || 'Could not reach the code execution service. Please try again.');
      } finally {
        setJudgeBusy(null);
      }
      return;
    }

    // Submit streams the judge's real progress (how many hidden test cases have
    // actually finished) so the student is not staring at a frozen spinner.
    setSubmitProgress({ phase: 'submitting', finished: 0, total: question.hiddenTestCaseCount || 0 });
    setSubmitResultsByQ((prev) => ({ ...prev, [questionId]: null }));

    let finalResult = null;
    let failure = null;
    try {
      await apiStream('/coding/submit?stream=1', {
        body: payload,
        onEvent: (event, data) => {
          if (event === 'progress') setSubmitProgress(data);
          else if (event === 'result') finalResult = data;
          else if (event === 'failed') failure = data.message;
        },
      });

      if (failure) throw new Error(failure);
      if (!finalResult) throw new Error('The judge closed the connection before returning a result.');

      setSubmitResultsByQ((prev) => ({ ...prev, [questionId]: finalResult }));
      setLastActionByQ((prev) => ({ ...prev, [questionId]: 'submit' }));
    } catch (error) {
      setJudgeError(error?.message || 'Could not reach the code execution service. Please try again.');
    } finally {
      setSubmitProgress(null);
      setJudgeBusy(null);
    }
  }, [assignmentId, customInputByQ, judgeBusy]);

  return {
    runResultsByQ,
    submitResultsByQ,
    lastActionByQ,
    customInputByQ,
    setCustomInput,
    judgeBusy,
    judgeError,
    submitProgress,
    execute,
  };
}
