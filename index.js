class Calculator {
  constructor(previousOperandTextElement, currentOperandTextElement) {
    this.previousOperandTextElement = previousOperandTextElement;
    this.currentOperandTextElement = currentOperandTextElement;
    this.clear();
  }

  // Clear all entries
  clear() {
    this.currentOperand = "";
    this.previousOperand = "";
    this.operation = undefined;
  }

  // Delete the last digit
  delete() {
    this.currentOperand = this.currentOperand.toString().slice(0, -1);
  }

  // Append a number or decimal point to the current operand
  appendNumber(number) {
    if (number === "." && this.currentOperand.includes(".")) return;
    this.currentOperand = `${this.currentOperand}${number}`;
  }

  // Choose an operation (+, -, *, ÷)
  chooseOperation(operation) {
    if (this.currentOperand === "") return;
    if (this.previousOperand !== "") {
      this.compute();
    }
    this.operation = operation;
    this.previousOperand = this.currentOperand;
    this.currentOperand = "";
  }

  // Compute the result based on the selected operation
  compute() {
    let computation;
    const prev = parseFloat(this.previousOperand);
    const current = parseFloat(this.currentOperand);

    if (isNaN(prev) || isNaN(current)) return;

    switch (this.operation) {
      case "+":
        computation = prev + current;
        break;
      case "-":
        computation = prev - current;
        break;
      case "*":
        computation = prev * current;
        break;
      case "÷":
        if (current === 0) {
          alert("Cannot divide by zero.");
          return;
        }
        computation = prev / current;
        break;
      default:
        return;
    }

    this.currentOperand = computation.toString();
    this.operation = undefined;
    this.previousOperand = "";
  }

  // Format the display number
  styleDisplayNumber(number) {
    if (number === "") return "";
    const floatNumber = parseFloat(number);
    if (isNaN(floatNumber)) return "";
    const [integerDigits, decimalDigits] = number.split(".");
    const integerDisplay = isNaN(integerDigits)
      ? ""
      : parseInt(integerDigits).toLocaleString("en", {
          maximumFractionDigits: 0,
        });
    return decimalDigits != null
      ? `${integerDisplay}.${decimalDigits}`
      : integerDisplay;
  }

  // Update the calculator display
  updateDisplay() {
    this.currentOperandTextElement.innerText = this.styleDisplayNumber(
      this.currentOperand
    );
    this.previousOperandTextElement.innerText = this.operation
      ? `${this.styleDisplayNumber(this.previousOperand)} ${this.operation}`
      : "";
  }
}

// Query selectors for DOM elements
const numberButtons = document.querySelectorAll("[data-number]");
const operationButtons = document.querySelectorAll("[data-operation]");
const equalsButton = document.querySelector("[data-equals]");
const deleteButton = document.querySelector("[data-delete]");
const allClearButton = document.querySelector("[data-all-clear]");
const previousOperandTextElement = document.querySelector(
  "[data-previous-operand]"
);
const currentOperandTextElement = document.querySelector(
  "[data-current-operand]"
);

// Instantiate the Calculator
const calculator = new Calculator(
  previousOperandTextElement,
  currentOperandTextElement
);

// Add event listeners to the buttons
numberButtons.forEach((button) => {
  button.addEventListener("click", () => {
    calculator.appendNumber(button.innerText);
    calculator.updateDisplay();
  });
});

operationButtons.forEach((button) => {
  button.addEventListener("click", () => {
    calculator.chooseOperation(button.innerText);
    calculator.updateDisplay();
  });
});

equalsButton.addEventListener("click", () => {
  calculator.compute();
  calculator.updateDisplay();
});

allClearButton.addEventListener("click", () => {
  calculator.clear();
  calculator.updateDisplay();
});

deleteButton.addEventListener("click", () => {
  calculator.delete();
  calculator.updateDisplay();
});
