"use strict";

const resultDisplay = document.querySelector("#result");
const expressionDisplay = document.querySelector("#expression");
const tooltip = document.querySelector("#tooltip");
const memoryPanel = document.querySelector("#memory-panel");
const memoryList = document.querySelector("#memory-list");
const memoryButtons = document.querySelectorAll("[data-memory]");
const magnitudeDisplay = document.querySelector("#magnitude");
const pasteButton = document.querySelector("#paste");
const millionUnitButton = document.querySelector("#million-unit");
const ansButton = document.querySelector('[data-const="ans"]');

let displayValue = "0";
let tokens = []; // committed expression tokens (numbers, "+","-","*","/","(",")") before the value currently being typed
let waitingForOperand = false;
let justCalculated = false;
let memoryEntries = []; // { value: number, time: number } oldest first, newest last
let selectedMemoryIndex = -1;
let lastAnswer = null;
let millionUnit = false;
let audioContext = null;
const MEMORY_LIMIT = 10;

function playClickSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext ??= new AudioContextClass();
  if (audioContext.state === "suspended") audioContext.resume();
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(1500, now);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.04);
}

const operatorSymbols = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const stateKey = "quickCalculatorState";

function isOperatorToken(token) {
  return token === "+" || token === "-" || token === "*" || token === "/";
}

function isNumberToken(token) {
  return typeof token === "string" && token !== "(" && token !== ")" && !isOperatorToken(token);
}

function tokensToText(tokenList) {
  return tokenList
    .map((token) => {
      if (isOperatorToken(token)) return operatorSymbols[token];
      if (token === "(" || token === ")") return token;
      return formatNumber(Number(token));
    })
    .join(" ");
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "エラー";
  const magnitude = Math.abs(value);
  if ((magnitude >= 1e15) || (magnitude > 0 && magnitude < 1e-10)) {
    return value.toExponential(10).replace(/\.0+e/, "e").replace(/(\.\d*?)0+e/, "$1e");
  }
  return Number(value.toPrecision(15)).toString();
}

function updateDisplay() {
  const formattedDisplay = addGroupSeparators(displayValue);
  resultDisplay.replaceChildren(...formattedDisplay);
  const visibleLength = resultDisplay.textContent.length;
  resultDisplay.classList.toggle("compact", visibleLength > 12);
  resultDisplay.classList.toggle("tiny", visibleLength > 17);
  magnitudeDisplay.textContent = approximateMagnitude(displayValue);
  millionUnitButton.setAttribute("aria-pressed", millionUnit.toString());
  saveState();
}

function currentEvalTokens() {
  const evalTokens = [...tokens];
  if (!waitingForOperand) evalTokens.push(displayValue);
  return evalTokens;
}

function updateExpressionDisplay() {
  expressionDisplay.textContent = tokensToText(currentEvalTokens()) || " ";
}

function isCompleteForEval(evalTokens) {
  const last = evalTokens[evalTokens.length - 1];
  return evalTokens.length > 0 && !isOperatorToken(last) && last !== "(";
}

function withAutoClosedParens(evalTokens) {
  let open = 0;
  for (const token of evalTokens) {
    if (token === "(") open++;
    else if (token === ")") open--;
  }
  const closed = [...evalTokens];
  for (let i = 0; i < open; i++) closed.push(")");
  return closed;
}

function evaluateTokens(tokenList) {
  let position = 0;
  const peek = () => tokenList[position];
  const consume = () => tokenList[position++];

  function parseExpression() {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const operator = consume();
      value = calculate(value, parseTerm(), operator);
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const operator = consume();
      value = calculate(value, parseFactor(), operator);
    }
    return value;
  }

  function parseFactor() {
    if (peek() === "(") {
      consume();
      const value = parseExpression();
      if (peek() === ")") consume();
      return value;
    }
    return Number(consume());
  }

  return parseExpression();
}

function percentBase() {
  const last = tokens[tokens.length - 1];
  if (!isOperatorToken(last)) return null;
  const previous = Number(tokens[tokens.length - 2]);
  return Number.isNaN(previous) ? null : previous;
}

function canStartOperand() {
  const last = tokens[tokens.length - 1];
  return !(waitingForOperand && !justCalculated && last === ")");
}

function addGroupSeparators(value) {
  if (value === "エラー" || /e/i.test(value)) return [document.createTextNode(value)];
  const [integer, decimal] = value.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const parts = grouped.split(",");
  const nodes = [];
  parts.forEach((part, index) => {
    if (index) {
      const separator = document.createElement("span");
      separator.className = "group-separator";
      separator.textContent = ",";
      nodes.push(separator);
    }
    nodes.push(document.createTextNode(part));
  });
  if (decimal !== undefined) nodes.push(document.createTextNode(`.${decimal}`));
  return nodes;
}

function approximateMagnitude(value) {
  const number = Number(value) * (millionUnit ? 1e6 : 1);
  const absolute = Math.abs(number);
  if (!Number.isFinite(number) || absolute < 10000) return "";

  const japaneseUnits = [
    { size: 1e12, label: "兆" },
    { size: 1e8, label: "億" },
    { size: 1e4, label: "万" }
  ];
  const englishUnits = [
    { size: 1e12, label: "trillion" },
    { size: 1e9, label: "billion" },
    { size: 1e6, label: "million" },
    { size: 1e3, label: "thousand" }
  ];
  const japanese = japaneseUnits.find((unit) => absolute >= unit.size);
  const english = englishUnits.find((unit) => absolute >= unit.size);
  const sign = number < 0 ? "−" : "";
  const japaneseValue = Number((absolute / japanese.size).toPrecision(3));
  const englishValue = Number((absolute / english.size).toPrecision(4));
  return `約${sign}${japaneseValue}${japanese.label} (${sign}${englishValue} ${english.label})`;
}

function saveState() {
  const state = {
    displayValue,
    tokens,
    waitingForOperand,
    justCalculated,
    memoryEntries,
    selectedMemoryIndex,
    lastAnswer,
    millionUnit,
    expression: expressionDisplay.textContent
  };
  localStorage.setItem(stateKey, JSON.stringify(state));
}

function restoreState() {
  try {
    const state = JSON.parse(localStorage.getItem(stateKey));
    if (!state || typeof state.displayValue !== "string") return;
    displayValue = state.displayValue;
    tokens = Array.isArray(state.tokens)
      ? state.tokens.filter((token) => typeof token === "string")
      : [];
    waitingForOperand = Boolean(state.waitingForOperand);
    justCalculated = Boolean(state.justCalculated);
    memoryEntries = Array.isArray(state.memoryEntries)
      ? state.memoryEntries
          .filter((entry) => entry && typeof entry.value === "number" && typeof entry.time === "number")
          .slice(-MEMORY_LIMIT)
      : [];
    selectedMemoryIndex = Number.isInteger(state.selectedMemoryIndex)
      && state.selectedMemoryIndex >= 0
      && state.selectedMemoryIndex < memoryEntries.length
      ? state.selectedMemoryIndex
      : (memoryEntries.length ? memoryEntries.length - 1 : -1);
    lastAnswer = typeof state.lastAnswer === "number" ? state.lastAnswer : null;
    millionUnit = Boolean(state.millionUnit);
    expressionDisplay.textContent = state.expression || " ";
  } catch {
    localStorage.removeItem(stateKey);
  }
}

function resetOnError() {
  if (displayValue === "エラー") clearAll();
}

function inputDigit(digit) {
  resetOnError();
  if (!canStartOperand()) return;
  if (waitingForOperand || justCalculated) {
    if (justCalculated) tokens = [];
    displayValue = digit;
    waitingForOperand = false;
    justCalculated = false;
    if (tokens.length === 0) expressionDisplay.innerHTML = "&nbsp;";
  } else if (displayValue === "0") {
    displayValue = digit;
  } else if (displayValue.replace("-", "").replace(".", "").length < 16) {
    displayValue += digit;
  }
  updateExpressionDisplay();
  updateDisplay();
}

function inputDecimal() {
  resetOnError();
  if (!canStartOperand()) return;
  if (waitingForOperand || justCalculated) {
    if (justCalculated) tokens = [];
    displayValue = "0.";
    waitingForOperand = false;
    justCalculated = false;
  } else if (!displayValue.includes(".")) displayValue += ".";
  updateExpressionDisplay();
  updateDisplay();
}

function calculate(left, right, operator) {
  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "*") return left * right;
  if (operator === "/") return right === 0 ? NaN : left / right;
  return right;
}

function chooseOperator(operator) {
  resetOnError();
  if (justCalculated) {
    tokens = [displayValue];
    justCalculated = false;
    tokens.push(operator);
    waitingForOperand = true;
    updateExpressionDisplay();
    saveState();
    return;
  }
  const last = tokens[tokens.length - 1];
  if (!waitingForOperand) {
    tokens.push(displayValue);
    tokens.push(operator);
  } else if (isOperatorToken(last)) {
    tokens[tokens.length - 1] = operator;
  } else if (last === ")") {
    tokens.push(operator);
  } else {
    return; // right after "(" or at the very start: no operand to operate on yet
  }
  waitingForOperand = true;
  updateExpressionDisplay();
  saveState();
}

function openParen() {
  resetOnError();
  const last = tokens[tokens.length - 1];
  if (waitingForOperand && !justCalculated && last === ")") return;
  if (!waitingForOperand && displayValue !== "0") return;
  if (justCalculated) tokens = [];
  justCalculated = false;
  tokens.push("(");
  displayValue = "0";
  waitingForOperand = true;
  updateExpressionDisplay();
  saveState();
}

function closeParen() {
  resetOnError();
  const openCount = tokens.filter((token) => token === "(").length
    - tokens.filter((token) => token === ")").length;
  if (openCount <= 0) return;
  const last = tokens[tokens.length - 1];
  if (waitingForOperand && last !== ")") return; // empty group or trailing operator
  if (!waitingForOperand) tokens.push(displayValue);
  tokens.push(")");
  waitingForOperand = true;
  updateExpressionDisplay();
  saveState();
}

function equals() {
  resetOnError();
  if (displayValue === "エラー" || tokens.length === 0) return;
  const evalTokens = currentEvalTokens();
  if (!isCompleteForEval(evalTokens)) return;
  const closedTokens = withAutoClosedParens(evalTokens);
  const trail = tokensToText(closedTokens);
  let result;
  try {
    result = evaluateTokens(closedTokens);
  } catch {
    result = NaN;
  }
  displayValue = formatNumber(result);
  expressionDisplay.textContent = `${trail} =`;
  tokens = [];
  waitingForOperand = true;
  justCalculated = true;
  if (Number.isFinite(result)) {
    lastAnswer = result;
    addMemoryEntry(result, Date.now());
    renderMemoryList();
    updateMemoryButtons();
  }
  updateConstantButtons();
  updateDisplay();
}

function insertConstant(value) {
  resetOnError();
  if (!canStartOperand()) return;
  if (justCalculated) tokens = [];
  displayValue = formatNumber(value);
  waitingForOperand = false;
  justCalculated = false;
  updateExpressionDisplay();
  updateDisplay();
}

function usePi() {
  insertConstant(Math.PI);
}

function useAns() {
  if (lastAnswer === null) return;
  insertConstant(lastAnswer);
}

function updateConstantButtons() {
  ansButton.setAttribute("aria-disabled", (lastAnswer === null).toString());
}

function clearAll() {
  displayValue = "0";
  tokens = [];
  waitingForOperand = false;
  justCalculated = false;
  expressionDisplay.innerHTML = "&nbsp;";
  updateDisplay();
}

function clearEntry() {
  const last = tokens[tokens.length - 1];
  if (waitingForOperand && last === ")") return;
  displayValue = "0";
  waitingForOperand = false;
  updateExpressionDisplay();
  updateDisplay();
}

function backspace() {
  if (displayValue === "エラー") return;
  if (!waitingForOperand && displayValue !== "0") {
    displayValue = displayValue.length > 1 ? displayValue.slice(0, -1) : "0";
    if (displayValue === "-") displayValue = "0";
    updateExpressionDisplay();
    updateDisplay();
    return;
  }
  if (justCalculated || tokens.length === 0) return;
  tokens.pop();
  const last = tokens[tokens.length - 1];
  if (isNumberToken(last)) {
    displayValue = tokens.pop();
    waitingForOperand = false;
  } else {
    displayValue = "0";
    waitingForOperand = true;
  }
  updateExpressionDisplay();
  updateDisplay();
}

function unary(action) {
  resetOnError();
  const value = Number(displayValue);
  let answer = value;
  let label = displayValue;
  if (action === "sign") answer = -value;
  if (action === "percent") {
    const base = percentBase();
    answer = base !== null ? base * value / 100 : value / 100;
  }
  if (action === "reciprocal") { answer = value === 0 ? NaN : 1 / value; label = `1/(${displayValue})`; }
  if (action === "square") { answer = value * value; label = `sqr(${displayValue})`; }
  if (action === "sqrt") { answer = value < 0 ? NaN : Math.sqrt(value); label = `√(${displayValue})`; }
  displayValue = formatNumber(answer);
  if (["reciprocal", "square", "sqrt"].includes(action)) expressionDisplay.textContent = label;
  updateDisplay();
}

function runAction(action) {
  if (action === "decimal") inputDecimal();
  else if (action === "equals") equals();
  else if (action === "clear") clearAll();
  else if (action === "ce") clearEntry();
  else if (action === "backspace") backspace();
  else unary(action);
}

function toggleParen(symbol) {
  if (symbol === "(") openParen();
  else closeParen();
}

document.querySelector(".keypad").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.getAttribute("aria-disabled") === "true") return;
  if (button.dataset.number) inputDigit(button.dataset.number);
  else if (button.dataset.operator) chooseOperator(button.dataset.operator);
  else if (button.dataset.paren) toggleParen(button.dataset.paren);
  else if (button.dataset.const === "pi") usePi();
  else if (button.dataset.const === "ans") useAns();
  else runAction(button.dataset.action);
  if (button.dataset.tooltip) showTooltip(button);
});

function updateMemoryButtons() {
  const memoryIsEmpty = memoryEntries.length === 0;
  memoryButtons.forEach((button) => {
    if (["clear", "recall", "list"].includes(button.dataset.memory)) {
      button.setAttribute("aria-disabled", memoryIsEmpty.toString());
    }
  });
  if (memoryIsEmpty) memoryPanel.hidden = true;
  saveState();
}

function formatMemoryTime(time) {
  return new Date(time).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function renderMemoryList() {
  const entriesNewestFirst = memoryEntries
    .map((entry, index) => ({ entry, index }))
    .reverse();
  memoryList.replaceChildren(
    ...entriesNewestFirst.map(({ entry, index }) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "memory-entry";
      row.dataset.index = String(index);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", (index === selectedMemoryIndex).toString());

      const value = document.createElement("span");
      value.textContent = formatNumber(entry.value);
      const time = document.createElement("span");
      time.className = "memory-entry-time";
      time.textContent = formatMemoryTime(entry.time);

      row.append(value, time);
      return row;
    })
  );
}

function addMemoryEntry(value, time) {
  memoryEntries.push({ value, time });
  if (memoryEntries.length > MEMORY_LIMIT) memoryEntries.shift();
  selectedMemoryIndex = memoryEntries.length - 1;
}

function useMemory(action) {
  if (displayValue === "エラー") return;
  const currentValue = Number(displayValue);
  const now = Date.now();

  if (action === "clear" && selectedMemoryIndex !== -1) {
    memoryEntries.splice(selectedMemoryIndex, 1);
    selectedMemoryIndex = memoryEntries.length ? Math.min(selectedMemoryIndex, memoryEntries.length - 1) : -1;
  }
  if (action === "store") addMemoryEntry(currentValue, now);
  if (action === "add") {
    if (selectedMemoryIndex === -1) addMemoryEntry(currentValue, now);
    else {
      memoryEntries[selectedMemoryIndex].value += currentValue;
      memoryEntries[selectedMemoryIndex].time = now;
    }
  }
  if (action === "subtract") {
    if (selectedMemoryIndex === -1) addMemoryEntry(-currentValue, now);
    else {
      memoryEntries[selectedMemoryIndex].value -= currentValue;
      memoryEntries[selectedMemoryIndex].time = now;
    }
  }
  if (action === "recall" && selectedMemoryIndex !== -1 && canStartOperand()) {
    if (justCalculated) tokens = [];
    displayValue = formatNumber(memoryEntries[selectedMemoryIndex].value);
    waitingForOperand = false;
    justCalculated = false;
    updateExpressionDisplay();
    updateDisplay();
  }
  if (action === "list") memoryPanel.hidden = !memoryPanel.hidden;
  else if (memoryEntries.length === 0) memoryPanel.hidden = true;
  renderMemoryList();
  updateMemoryButtons();
}

memoryList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-index]");
  if (!row) return;
  selectedMemoryIndex = Number(row.dataset.index);
  renderMemoryList();
  updateMemoryButtons();
});

document.querySelector(".memory").addEventListener("click", (event) => {
  const button = event.target.closest("[data-memory]");
  if (button?.getAttribute("aria-disabled") !== "true") {
    useMemory(button.dataset.memory);
    showTooltip(button);
  }
});

function previewBackspace() {
  if (displayValue === "エラー") return displayValue;
  if (!waitingForOperand && displayValue !== "0") {
    const shortened = displayValue.length > 1 ? displayValue.slice(0, -1) : "0";
    return shortened === "-" ? "0" : shortened;
  }
  if (justCalculated || tokens.length === 0) return displayValue;
  const remaining = tokens.slice(0, -1);
  const last = remaining[remaining.length - 1];
  return isNumberToken(last) ? last : "0";
}

function previewAction(action) {
  const value = Number(displayValue);
  if (displayValue === "エラー") return "エラーをクリアしてから使用できます";
  if (action === "percent") {
    const base = percentBase();
    return formatNumber(base !== null ? base * value / 100 : value / 100);
  }
  if (action === "ce" || action === "clear") return "0";
  if (action === "backspace") return previewBackspace();
  if (action === "reciprocal") return formatNumber(value === 0 ? NaN : 1 / value);
  if (action === "square") return formatNumber(value * value);
  if (action === "sqrt") return formatNumber(value < 0 ? NaN : Math.sqrt(value));
  if (action === "sign") return formatNumber(-value);
  if (action === "decimal") {
    if (waitingForOperand || justCalculated) return "0.";
    return displayValue.includes(".") ? displayValue : `${displayValue}.`;
  }
  if (action === "equals") {
    if (tokens.length === 0) return "演算子を選ぶと計算結果を確認できます";
    const evalTokens = currentEvalTokens();
    if (!isCompleteForEval(evalTokens)) return "式を入力すると計算結果を確認できます";
    let result;
    try {
      result = evaluateTokens(withAutoClosedParens(evalTokens));
    } catch {
      result = NaN;
    }
    return formatNumber(result);
  }
  return displayValue;
}

function tooltipText(target) {
  if (target.dataset.copyResult !== undefined) {
    return `結果をコピー：${displayValue}\nクリックするとクリップボードへコピーします`;
  }
  if (target === millionUnitButton) {
    const nextState = millionUnit ? "通常単位" : "百万円単位";
    return `${target.dataset.tooltip}\n現在：${millionUnit ? "百万円単位" : "通常単位"}\nクリック後：${nextState}`;
  }
  const explanation = target.dataset.tooltip;
  const memoryAction = target.dataset.memory;
  if (memoryAction) {
    const hasSelection = selectedMemoryIndex !== -1;
    const selected = hasSelection ? formatNumber(memoryEntries[selectedMemoryIndex].value) : "未保存";
    let result = selected;
    if (memoryAction === "clear") result = hasSelection ? "選択中のメモリを削除します" : "選択中のメモリはありません";
    if (memoryAction === "store") result = `新しいメモリとして保存：${displayValue}`;
    if (memoryAction === "add") {
      result = hasSelection
        ? formatNumber(memoryEntries[selectedMemoryIndex].value + Number(displayValue))
        : `新しいメモリとして保存：${displayValue}`;
    }
    if (memoryAction === "subtract") {
      result = hasSelection
        ? formatNumber(memoryEntries[selectedMemoryIndex].value - Number(displayValue))
        : `新しいメモリとして保存：${formatNumber(-Number(displayValue))}`;
    }
    if (memoryAction === "recall" && !hasSelection) result = "呼び出せる数値はありません";
    if (memoryAction === "list" && memoryEntries.length === 0) result = "表示できる数値はありません";
    return `${explanation}\n選択中のメモリ：${selected}\n件数：${memoryEntries.length}/${MEMORY_LIMIT}\n押した後：${result}`;
  }

  if (target.dataset.operator) {
    const symbol = operatorSymbols[target.dataset.operator];
    const preview = tokensToText(currentEvalTokens());
    return `${explanation}\n押した後：${preview} ${symbol} …`;
  }

  if (target.dataset.paren) {
    const preview = tokensToText([...currentEvalTokens(), target.dataset.paren]);
    return `${explanation}\n押した後：${preview} …`;
  }

  if (target.dataset.const === "pi") {
    return `${explanation}\n押した後の表示：${formatNumber(Math.PI)}`;
  }

  if (target.dataset.const === "ans") {
    return lastAnswer === null
      ? `${explanation}\n直前の計算結果がありません`
      : `${explanation}\n押した後の表示：${formatNumber(lastAnswer)}`;
  }

  return `${explanation}\n押した後の表示：${previewAction(target.dataset.action)}`;
}

function showTooltip(target) {
  tooltip.textContent = tooltipText(target);
  tooltip.classList.add("visible");

  showTooltipPosition(target);
}

function showTooltipPosition(target) {
  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 8;
  const edge = 6;
  const centeredLeft = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
  const left = Math.min(
    Math.max(centeredLeft, edge),
    window.innerWidth - tooltipRect.width - edge
  );
  const above = targetRect.top - tooltipRect.height - gap;
  const below = targetRect.bottom + gap;
  const top = above >= edge
    ? above
    : Math.min(below, window.innerHeight - tooltipRect.height - edge);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(top, edge)}px`;
}

async function copyResult() {
  if (displayValue === "エラー") return;
  let copied = false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(displayValue);
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (!copied) {
    const input = document.createElement("textarea");
    input.value = displayValue;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    copied = document.execCommand("copy");
    input.remove();
  }
  tooltip.textContent = copied
    ? `コピーしました：${displayValue}`
    : "コピーできませんでした";
  tooltip.classList.add("visible");
}

resultDisplay.addEventListener("click", copyResult);

function parseClipboardNumber(text) {
  const normalized = text.trim().replaceAll(",", "");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? formatNumber(number) : null;
}

async function pasteNumber() {
  try {
    const pastedValue = parseClipboardNumber(await navigator.clipboard.readText());
    if (pastedValue === null) {
      tooltip.textContent = "クリップボードに貼り付け可能な数値がありません";
    } else if (!canStartOperand()) {
      tooltip.textContent = "先に演算子を入力してから貼り付けてください";
    } else {
      if (justCalculated) tokens = [];
      displayValue = pastedValue;
      waitingForOperand = false;
      justCalculated = false;
      updateExpressionDisplay();
      updateDisplay();
      tooltip.textContent = `貼り付けました：${pastedValue}`;
    }
  } catch {
    tooltip.textContent = "クリップボードを読み取れませんでした";
  }
  tooltip.classList.add("visible");
  showTooltipPosition(pasteButton);
}

pasteButton.addEventListener("click", pasteNumber);

millionUnitButton.addEventListener("click", () => {
  millionUnit = !millionUnit;
  updateDisplay();
  showTooltip(millionUnitButton);
});

function hideTooltip() {
  tooltip.classList.remove("visible");
}

document.addEventListener("mouseover", (event) => {
  const target = event.target.closest("[data-tooltip], [data-copy-result]");
  if (target) showTooltip(target);
});

document.addEventListener("mouseout", (event) => {
  const target = event.target.closest("[data-tooltip], [data-copy-result]");
  if (target && !target.contains(event.relatedTarget)) hideTooltip();
});

document.addEventListener("focusin", (event) => {
  if (event.target.matches("[data-tooltip], [data-copy-result]")) showTooltip(event.target);
});

document.addEventListener("focusout", (event) => {
  if (event.target.matches("[data-tooltip], [data-copy-result]")) hideTooltip();
});

document.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("button");
  if (!button || button.getAttribute("aria-disabled") === "true") return;
  playClickSound();
});

document.addEventListener("keydown", (event) => {
  const key = event.key;
  if (event.target === resultDisplay && (key === "Enter" || key === " ")) return;
  let selector;
  if (/^[0-9]$/.test(key)) { inputDigit(key); selector = `[data-number="${key}"]`; }
  else if (["+", "-", "*", "/"].includes(key)) { chooseOperator(key); selector = `[data-operator="${key}"]`; }
  else if (key === "(") { openParen(); selector = '[data-paren="("]'; }
  else if (key === ")") { closeParen(); selector = '[data-paren=")"]'; }
  else if (key === "." || key === ",") { inputDecimal(); selector = '[data-action="decimal"]'; }
  else if (key === "Enter" || key === "=") { equals(); selector = '[data-action="equals"]'; }
  else if (key === "Backspace") { backspace(); selector = '[data-action="backspace"]'; }
  else if (key === "Escape") { clearAll(); selector = '[data-action="clear"]'; }
  else if (key === "Delete") { clearEntry(); selector = '[data-action="ce"]'; }
  else if (key === "%") { unary("percent"); selector = '[data-action="percent"]'; }
  else return;
  event.preventDefault();
  playClickSound();
  const button = document.querySelector(selector);
  button?.classList.add("pressed");
  setTimeout(() => button?.classList.remove("pressed"), 100);
});

restoreState();
updateDisplay();
updateMemoryButtons();
updateConstantButtons();
