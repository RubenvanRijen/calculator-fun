"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Calculator = void 0;
var Calculator = /** @class */ (function () {
    function Calculator(previousOperandTextElement, currentOperandTextElement) {
        this.currentOperandTextElement = currentOperandTextElement;
        this.previousOperandTextElement = previousOperandTextElement;
        this.clear();
    }
    Calculator.prototype.clear = function () {
        this.currentOperand = '';
        this.previousOperand = '';
        this.operation = null;
    };
    Calculator.prototype.delete = function () {
        this.currentOperand = this.currentOperand.toString().slice(0, -1);
    };
    Calculator.prototype.appendNumber = function (number) {
        if (number === '.' && this.currentOperand.includes('.'))
            return;
        this.currentOperand = this.currentOperand.toString() + number.toString();
    };
    Calculator.prototype.chooseoperation = function (operation) {
        if (this.currentOperand === '')
            return;
        if (this.previousOperand !== '') {
            this.compute();
        }
        this.operation = operation;
        this.previousOperand = this.currentOperand;
        this.currentOperand = '';
    };
    Calculator.prototype.compute = function () {
        var computation;
        var prev = parseFloat(this.previousOperand);
        var current = parseFloat(this.currentOperand);
        if (isNaN(prev) || isNaN(current))
            return;
        switch (this.operation) {
            case '+':
                computation = prev + current;
                break;
            case '-':
                computation = prev - current;
                break;
            case '*':
                computation = prev * current;
                break;
            case '÷':
                computation = prev / current;
                break;
            default:
                return;
        }
        this.currentOperand = computation;
        this.operation = null;
        this.previousOperand = '';
    };
    Calculator.prototype.styleDisplayNumber = function (number) {
        var stringNumber = number.toString();
        var integerDigits = parseFloat(stringNumber.split('.')[0]);
        var decimalDigits = (stringNumber.split('.')[1]);
        var integerDisplay = '';
        if (isNaN(integerDigits)) {
            integerDisplay = '';
        }
        else {
            integerDisplay = integerDigits.toLocaleString('en', {
                maximumFractionDigits: 0
            });
        }
        if (decimalDigits !== null && decimalDigits !== undefined) {
            return "".concat(integerDisplay, ".").concat(decimalDigits);
        }
        else {
            return integerDisplay;
        }
    };
    Calculator.prototype.updateDisplay = function () {
        this.currentOperandTextElement.innerText = this.styleDisplayNumber(this.currentOperand);
        if (this.operation !== undefined && this.operation !== null) {
            this.previousOperandTextElement.innerText = "".concat(this.styleDisplayNumber(this.previousOperand), " ").concat(this.operation);
        }
        else {
            this.previousOperandTextElement.innerText = '';
        }
    };
    return Calculator;
}());
exports.Calculator = Calculator;
