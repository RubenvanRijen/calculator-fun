"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Index = void 0;
var Calculator_1 = require("./Calculator");
var Index = /** @class */ (function () {
    function Index() {
        this.numberButtons = document.querySelectorAll("[data-number]");
        this.operationButtons = document.querySelectorAll("[data-operation]");
        this.equalsButton = document.querySelector("[data-equals]");
        this.deleteButton = document.querySelector("[data-delete]");
        this.allClearButton = document.querySelector("[data-all-clear]");
        this.previousOperandTextElement = document.querySelector("[data-previous-operand]");
        this.currentOperandTextElement = document.querySelector("[data-current-operand]");
        this.init();
    }
    Index.prototype.init = function () {
        var _a, _b, _c;
        var calculator = new Calculator_1.Calculator(this.previousOperandTextElement, this.currentOperandTextElement);
        this.numberButtons.forEach(function (button) {
            button.addEventListener('click', function () {
                calculator.appendNumber(button.innerText);
                calculator.updateDisplay();
            });
        });
        this.operationButtons.forEach(function (button) {
            button.addEventListener('click', function () {
                calculator.chooseoperation(button.innerText);
                calculator.updateDisplay();
            });
        });
        (_a = this.equalsButton) === null || _a === void 0 ? void 0 : _a.addEventListener('click', function (button) {
            calculator.compute();
            calculator.updateDisplay();
        });
        (_b = this.allClearButton) === null || _b === void 0 ? void 0 : _b.addEventListener('click', function (button) {
            calculator.clear();
            calculator.updateDisplay();
        });
        (_c = this.deleteButton) === null || _c === void 0 ? void 0 : _c.addEventListener('click', function (button) {
            calculator.delete();
            calculator.updateDisplay();
        });
    };
    return Index;
}());
exports.Index = Index;
