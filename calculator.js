"use strict";

const resultDisplay = document.querySelector("#result");
const expressionDisplay = document.querySelector("#expression");
const tooltip = document.querySelector("#tooltip");
const memoryPanel = document.querySelector("#memory-panel");
const memoryButtons = document.querySelectorAll("[data-memory]");

let displayValue = "0";
let storedValue = null;
let pendingOperator = null;
let waitingForOperand = false;
let justCalculated = false;
let memoryValue = null;

const operatorSymbols = { "+": "+", "-": "−", "*": "×", "/": "÷" };

function formatNumber(value) {
  if (!Number.isFinite(value)) return "エラー";
  const magnitude = Math.abs(value);
  if ((magnitude >= 1e15) || (magnitude > 0 && magnitude < 1e-10)) {
    return value.toExponential(10).replace(/\.0+e/, "e").replace(/(\.\d*?)0+e/, "$1e");
  }
  return Number(value.toPrecision(15)).toString();
}

function updateDisplay() {
  resultDisplay.textContent = displayValue;
  resultDisplay.classList.toggle("compact", displayValue.length > 12);
  resultDisplay.classList.toggle("tiny", displayValue.length > 17);
}

function resetOnError() {
  if (displayValue === "エラー") clearAll();
}

function inputDigit(digit) {
  resetOnError();
  if (waitingForOperand || justCalculated) {
    displayValue = digit;
    waitingForOperand = false;
    justCalculated = false;
    if (storedValue === null) expressionDisplay.innerHTML = "&nbsp;";
  } else if (displayValue === "0") {
    displayValue = digit;
  } else if (displayValue.replace("-", "").replace(".", "").length < 16) {
    displayValue += digit;
  }
  updateDisplay();
}

function inputDecimal() {
  resetOnError();
  if (waitingForOperand || justCalculated) {
    displayValue = "0.";
    waitingForOperand = false;
    justCalculated = false;
  } else if (!displayValue.includes(".")) displayValue += ".";
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
  const input = Number(displayValue);
  if (pendingOperator && !waitingForOperand) {
    displayValue = formatNumber(calculate(storedValue, input, pendingOperator));
    storedValue = Number(displayValue);
    updateDisplay();
  } else {
    storedValue = input;
  }
  pendingOperator = operator;
  waitingForOperand = true;
  justCalculated = false;
  expressionDisplay.textContent = `${formatNumber(storedValue)} ${operatorSymbols[operator]}`;
}

function equals() {
  if (!pendingOperator || displayValue === "エラー") return;
  const right = Number(displayValue);
  const left = storedValue;
  displayValue = formatNumber(calculate(left, right, pendingOperator));
  expressionDisplay.textContent = `${formatNumber(left)} ${operatorSymbols[pendingOperator]} ${formatNumber(right)} =`;
  storedValue = null;
  pendingOperator = null;
  waitingForOperand = true;
  justCalculated = true;
  updateDisplay();
}

function clearAll() {
  displayValue = "0";
  storedValue = null;
  pendingOperator = null;
  waitingForOperand = false;
  justCalculated = false;
  expressionDisplay.innerHTML = "&nbsp;";
  updateDisplay();
}

function clearEntry() { displayValue = "0"; waitingForOperand = false; updateDisplay(); }

function backspace() {
  if (waitingForOperand || justCalculated || displayValue === "エラー") return;
  displayValue = displayValue.length > 1 ? displayValue.slice(0, -1) : "0";
  if (displayValue === "-") displayValue = "0";
  updateDisplay();
}

function unary(action) {
  resetOnError();
  const value = Number(displayValue);
  let answer = value;
  let label = displayValue;
  if (action === "sign") answer = -value;
  if (action === "percent") answer = storedValue !== null ? storedValue * value / 100 : value / 100;
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

document.querySelector(".keypad").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.number) inputDigit(button.dataset.number);
  else if (button.dataset.operator) chooseOperator(button.dataset.operator);
  else runAction(button.dataset.action);
});

function updateMemoryButtons() {
  const memoryIsEmpty = memoryValue === null;
  memoryButtons.forEach((button) => {
    if (["clear", "recall", "list"].includes(button.dataset.memory)) {
      button.setAttribute("aria-disabled", memoryIsEmpty.toString());
    }
  });
  if (memoryIsEmpty) memoryPanel.hidden = true;
}

function useMemory(action) {
  if (displayValue === "エラー") return;
  const currentValue = Number(displayValue);

  if (action === "clear") memoryValue = null;
  if (action === "store") memoryValue = currentValue;
  if (action === "add") memoryValue = (memoryValue ?? 0) + currentValue;
  if (action === "subtract") memoryValue = (memoryValue ?? 0) - currentValue;
  if (action === "recall" && memoryValue !== null) {
    displayValue = formatNumber(memoryValue);
    waitingForOperand = false;
    justCalculated = false;
    updateDisplay();
  }
  if (action === "list" && memoryValue !== null) {
    memoryPanel.textContent = formatNumber(memoryValue);
    memoryPanel.hidden = !memoryPanel.hidden;
  } else if (action !== "list") {
    memoryPanel.hidden = true;
  }
  updateMemoryButtons();
}

document.querySelector(".memory").addEventListener("click", (event) => {
  const button = event.target.closest("[data-memory]");
  if (button?.getAttribute("aria-disabled") !== "true") useMemory(button.dataset.memory);
});

function showTooltip(target) {
  tooltip.textContent = target.dataset.tooltip;
  tooltip.classList.add("visible");

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

function hideTooltip() {
  tooltip.classList.remove("visible");
}

document.addEventListener("mouseover", (event) => {
  const target = event.target.closest("[data-tooltip]");
  if (target) showTooltip(target);
});

document.addEventListener("mouseout", (event) => {
  const target = event.target.closest("[data-tooltip]");
  if (target && !target.contains(event.relatedTarget)) hideTooltip();
});

document.addEventListener("focusin", (event) => {
  if (event.target.matches("[data-tooltip]")) showTooltip(event.target);
});

document.addEventListener("focusout", (event) => {
  if (event.target.matches("[data-tooltip]")) hideTooltip();
});

document.addEventListener("keydown", (event) => {
  const key = event.key;
  let selector;
  if (/^[0-9]$/.test(key)) { inputDigit(key); selector = `[data-number="${key}"]`; }
  else if (["+", "-", "*", "/"].includes(key)) { chooseOperator(key); selector = `[data-operator="${key}"]`; }
  else if (key === "." || key === ",") { inputDecimal(); selector = '[data-action="decimal"]'; }
  else if (key === "Enter" || key === "=") { equals(); selector = '[data-action="equals"]'; }
  else if (key === "Backspace") { backspace(); selector = '[data-action="backspace"]'; }
  else if (key === "Escape") { clearAll(); selector = '[data-action="clear"]'; }
  else if (key === "Delete") { clearEntry(); selector = '[data-action="ce"]'; }
  else if (key === "%") { unary("percent"); selector = '[data-action="percent"]'; }
  else return;
  event.preventDefault();
  const button = document.querySelector(selector);
  button?.classList.add("pressed");
  setTimeout(() => button?.classList.remove("pressed"), 100);
});

updateDisplay();
updateMemoryButtons();
