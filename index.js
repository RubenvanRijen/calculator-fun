"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Calculator_1 = require("./Calculator");
function init() {
    var numberButtons = document.querySelectorAll("[data-number]");
    var operationButtons = document.querySelectorAll("[data-operation]");
    var equalsButton = document.querySelector("[data-equals]");
    var deleteButton = document.querySelector("[data-delete]");
    var allClearButton = document.querySelector("[data-all-clear]");
    var previousOperandTextElement = document.querySelector("[data-previous-operand]");
    var currentOperandTextElement = document.querySelector("[data-current-operand]");
    var calculator = new Calculator_1.Calculator(previousOperandTextElement, currentOperandTextElement);
    numberButtons === null || numberButtons === void 0 ? void 0 : numberButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            calculator.appendNumber(button.innerText);
            calculator.updateDisplay();
        });
    });
    operationButtons === null || operationButtons === void 0 ? void 0 : operationButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            calculator.chooseoperation(button.innerText);
            calculator.updateDisplay();
        });
    });
    equalsButton === null || equalsButton === void 0 ? void 0 : equalsButton.addEventListener('click', function (button) {
        calculator.compute();
        calculator.updateDisplay();
    });
    allClearButton === null || allClearButton === void 0 ? void 0 : allClearButton.addEventListener('click', function (button) {
        calculator.clear();
        calculator.updateDisplay();
    });
    deleteButton === null || deleteButton === void 0 ? void 0 : deleteButton.addEventListener('click', function (button) {
        calculator.delete();
        calculator.updateDisplay();
    });
}
init();
