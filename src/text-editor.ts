/** Add or remove one level of indentation without disturbing other lines. */
export function adjustIndentation(textarea: HTMLTextAreaElement, outdent = false) {
    const { value, selectionStart: start, selectionEnd: end } = textarea;
    const indent = "    ";
    if (start === end && !outdent) {
        textarea.setRangeText(indent, start, end, "end");
    } else {
        const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
        // A selection ending just after a newline does not include the next line.
        const lastSelected = end > start && value[end - 1] === "\n" ? end - 1 : end;
        const nextNewline = value.indexOf("\n", lastSelected);
        const lineEnd = nextNewline === -1 ? value.length : nextNewline;
        const original = value.slice(lineStart, lineEnd);
        const lines = original.split("\n");
        const updated = lines.map((line) => outdent ? line.replace(/^(?:\t| {1,4})/, "") : indent + line);
        const replacement = updated.join("\n");
        const firstDelta = updated[0].length - lines[0].length;
        const totalDelta = replacement.length - original.length;
        textarea.setRangeText(replacement, lineStart, lineEnd);
        const newStart = Math.max(lineStart, start + firstDelta);
        textarea.setSelectionRange(newStart, Math.max(newStart, end + totalDelta));
    }
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
