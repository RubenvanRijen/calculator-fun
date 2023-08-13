/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./Calculator.js":
/*!***********************!*\
  !*** ./Calculator.js ***!
  \***********************/
/***/ ((__unused_webpack_module, exports) => {

eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nexports.Calculator = void 0;\nvar Calculator = /** @class */ (function () {\n    function Calculator(previousOperandTextElement, currentOperandTextElement) {\n        this.currentOperandTextElement = currentOperandTextElement;\n        this.previousOperandTextElement = previousOperandTextElement;\n        this.clear();\n    }\n    Calculator.prototype.clear = function () {\n        this.currentOperand = '';\n        this.previousOperand = '';\n        this.operation = null;\n    };\n    Calculator.prototype.delete = function () {\n        this.currentOperand = this.currentOperand.toString().slice(0, -1);\n    };\n    Calculator.prototype.appendNumber = function (number) {\n        if (number === '.' && this.currentOperand.includes('.'))\n            return;\n        this.currentOperand = this.currentOperand.toString() + number.toString();\n    };\n    Calculator.prototype.chooseoperation = function (operation) {\n        if (this.currentOperand === '')\n            return;\n        if (this.previousOperand !== '') {\n            this.compute();\n        }\n        this.operation = operation;\n        this.previousOperand = this.currentOperand;\n        this.currentOperand = '';\n    };\n    Calculator.prototype.compute = function () {\n        var computation;\n        var prev = parseFloat(this.previousOperand);\n        var current = parseFloat(this.currentOperand);\n        if (isNaN(prev) || isNaN(current))\n            return;\n        switch (this.operation) {\n            case '+':\n                computation = prev + current;\n                break;\n            case '-':\n                computation = prev - current;\n                break;\n            case '*':\n                computation = prev * current;\n                break;\n            case '÷':\n                computation = prev / current;\n                break;\n            default:\n                return;\n        }\n        this.currentOperand = computation;\n        this.operation = null;\n        this.previousOperand = '';\n    };\n    Calculator.prototype.styleDisplayNumber = function (number) {\n        var stringNumber = number.toString();\n        var integerDigits = parseFloat(stringNumber.split('.')[0]);\n        var decimalDigits = (stringNumber.split('.')[1]);\n        var integerDisplay = '';\n        if (isNaN(integerDigits)) {\n            integerDisplay = '';\n        }\n        else {\n            integerDisplay = integerDigits.toLocaleString('en', {\n                maximumFractionDigits: 0\n            });\n        }\n        if (decimalDigits !== null && decimalDigits !== undefined) {\n            return \"\".concat(integerDisplay, \".\").concat(decimalDigits);\n        }\n        else {\n            return integerDisplay;\n        }\n    };\n    Calculator.prototype.updateDisplay = function () {\n        this.currentOperandTextElement.innerText = this.styleDisplayNumber(this.currentOperand);\n        if (this.operation !== undefined && this.operation !== null) {\n            this.previousOperandTextElement.innerText = \"\".concat(this.styleDisplayNumber(this.previousOperand), \" \").concat(this.operation);\n        }\n        else {\n            this.previousOperandTextElement.innerText = '';\n        }\n    };\n    return Calculator;\n}());\nexports.Calculator = Calculator;\n\n\n//# sourceURL=webpack://calculator-fun/./Calculator.js?");

/***/ }),

/***/ "./index.js":
/*!******************!*\
  !*** ./index.js ***!
  \******************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\nvar Calculator_1 = __webpack_require__(/*! ./Calculator */ \"./Calculator.js\");\nfunction init() {\n    var numberButtons = document.querySelectorAll(\"[data-number]\");\n    var operationButtons = document.querySelectorAll(\"[data-operation]\");\n    var equalsButton = document.querySelector(\"[data-equals]\");\n    var deleteButton = document.querySelector(\"[data-delete]\");\n    var allClearButton = document.querySelector(\"[data-all-clear]\");\n    var previousOperandTextElement = document.querySelector(\"[data-previous-operand]\");\n    var currentOperandTextElement = document.querySelector(\"[data-current-operand]\");\n    var calculator = new Calculator_1.Calculator(previousOperandTextElement, currentOperandTextElement);\n    numberButtons === null || numberButtons === void 0 ? void 0 : numberButtons.forEach(function (button) {\n        button.addEventListener('click', function () {\n            calculator.appendNumber(button.innerText);\n            calculator.updateDisplay();\n        });\n    });\n    operationButtons === null || operationButtons === void 0 ? void 0 : operationButtons.forEach(function (button) {\n        button.addEventListener('click', function () {\n            calculator.chooseoperation(button.innerText);\n            calculator.updateDisplay();\n        });\n    });\n    equalsButton === null || equalsButton === void 0 ? void 0 : equalsButton.addEventListener('click', function (button) {\n        calculator.compute();\n        calculator.updateDisplay();\n    });\n    allClearButton === null || allClearButton === void 0 ? void 0 : allClearButton.addEventListener('click', function (button) {\n        calculator.clear();\n        calculator.updateDisplay();\n    });\n    deleteButton === null || deleteButton === void 0 ? void 0 : deleteButton.addEventListener('click', function (button) {\n        calculator.delete();\n        calculator.updateDisplay();\n    });\n}\ninit();\n\n\n//# sourceURL=webpack://calculator-fun/./index.js?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./index.js");
/******/ 	
/******/ })()
;