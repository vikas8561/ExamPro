/** Has this question got an answer? An MCQ by its chosen index, the rest by text. */
export function isAnsweredValue(question, answer) {
  if (question.kind === "mcq") return answer !== undefined && answer !== null && answer !== "";
  return typeof answer === "string" && answer.trim() !== "";
}

/** Words in a written answer, for the counter above the answer box. */
export function wordCount(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
