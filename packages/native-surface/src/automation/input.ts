import type { CNode } from '../engine/node';
import { getFocusedInputElement, getFocusedInputNode, inputKeyPressed, inputTextChanged, inputValueOf, specOfInput, submitInput } from '../engine/textInputState';
import type { KeyOptions } from './types';

const carets = new WeakMap<CNode, { start: number; end: number }>();
function selection(node: CNode) {
  const el = getFocusedInputElement();
  const value = inputValueOf(node);
  return { value, el, ...(el ? { start: el.selectionStart ?? value.length, end: el.selectionEnd ?? value.length }
    : carets.get(node) ?? { start: specOfInput(node).selectTextOnFocus ? 0 : value.length, end: value.length }) };
}
function select(node: CNode, start: number, end = start) {
  carets.set(node, { start, end });
  if (getFocusedInputNode() === node) {
    try { getFocusedInputElement()?.setSelectionRange(start, end); } catch { /* email/number */ }
  }
}
function replace(node: CNode, text: string, inputType: string, start?: number, end?: number) {
  const s = selection(node);
  start ??= s.start; end ??= s.end;
  const maxLength = specOfInput(node).maxLength;
  if (maxLength != null && text.length) {
    text = text.slice(0, Math.max(0, maxLength - (s.value.length - (end - start))));
    if (!text) return;
  }
  const value = s.value.slice(0, start) + text + s.value.slice(end);
  if (s.el) {
    const win = s.el.ownerDocument.defaultView!;
    if (!s.el.dispatchEvent(new win.InputEvent('beforeinput', { bubbles: true, cancelable: true, data: text, inputType }))) return;
    s.el.value = value;
    select(node, start + text.length);
    s.el.dispatchEvent(new win.InputEvent('input', { bubbles: true, data: text, inputType }));
  } else inputTextChanged(node, value);
  select(node, Math.min(start + text.length, inputValueOf(node).length));
}

/** The overlay's normal input event is the browser boundary. Headless uses its
 * existing controller/state machine. No callback invocation on app components. */
export function typeInto(node: CNode, text: string): void {
  const spec = specOfInput(node);
  if (spec.editable === false) throw new Error('native-surface: focused input is not editable');
  if (!spec.multiline) text = text.replace(/[\r\n]/g, '');
  replace(node, text, 'insertText');
}

export function keyInto(node: CNode, key: string, options: KeyOptions = {}): void {
  if (options.altKey || ((options.ctrlKey || options.metaKey) && key.toLowerCase() !== 'a')) {
    throw new Error('native-surface: use browser keyboard input for this modifier combination');
  }
  const spec = specOfInput(node), s = selection(node);
  let allowed = true;
  if (s.el) {
    const win = s.el.ownerDocument.defaultView!;
    allowed = s.el.dispatchEvent(new win.KeyboardEvent('keydown', { key, ...options, bubbles: true, cancelable: true }));
  } else {
    inputKeyPressed(node, key);
    if (key === 'Enter') {
      const behavior = spec.submitBehavior ?? (spec.blurOnSubmit != null
        ? spec.blurOnSubmit ? 'blurAndSubmit' : 'submit' : spec.multiline ? 'newline' : 'blurAndSubmit');
      if (!spec.multiline || (!options.shiftKey && behavior !== 'newline')) {
        submitInput(node); allowed = false;
      }
    }
  }
  if (allowed) {
    if (key.toLowerCase() === 'a' && (options.ctrlKey || options.metaKey)) select(node, 0, s.value.length);
    else if (key === 'Backspace') {
      const prev = Array.from(s.value.slice(0, s.start)).at(-1)?.length ?? 0;
      replace(node, '', 'deleteContentBackward', s.start === s.end ? s.start - prev : s.start, s.end);
    } else if (key === 'Delete') {
      const next = Array.from(s.value.slice(s.end))[0]?.length ?? 0;
      replace(node, '', 'deleteContentForward', s.start, s.start === s.end ? s.end + next : s.end);
    } else if (key === 'Enter' && spec.multiline) replace(node, '\n', 'insertLineBreak');
    else if (key === 'Home') select(node, 0, options.shiftKey ? s.end : 0);
    else if (key === 'End') select(node, options.shiftKey ? s.start : s.value.length, s.value.length);
    else if (key === 'ArrowLeft') {
      const prev = Array.from(s.value.slice(0, s.start)).at(-1)?.length ?? 0;
      const at = Math.max(0, s.start === s.end || options.shiftKey ? s.start - prev : s.start);
      select(node, at, options.shiftKey ? s.end : at);
    } else if (key === 'ArrowRight') {
      const next = Array.from(s.value.slice(s.end))[0]?.length ?? 0;
      const at = Math.min(s.value.length, s.start === s.end || options.shiftKey ? s.end + next : s.end);
      select(node, options.shiftKey ? s.start : at, at);
    } else if (Array.from(key).length === 1 && !options.ctrlKey && !options.metaKey && !options.altKey) typeInto(node, key);
    else if (!['Enter', 'Shift', 'Control', 'Meta', 'Alt', 'Escape'].includes(key)) {
      throw new Error(`native-surface: synthetic default action for ${key} is unsupported; use browser keyboard input`);
    }
  }
  if (s.el) {
    const win = s.el.ownerDocument.defaultView!;
    s.el.dispatchEvent(new win.KeyboardEvent('keyup', { key, ...options, bubbles: true }));
  }
}
