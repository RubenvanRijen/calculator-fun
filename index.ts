
import { Calculator} from './Calculator';



function init(): void{
     const numberButtons = document.querySelectorAll("[data-number]");
     const operationButtons = document.querySelectorAll("[data-operation]");
     const equalsButton = document.querySelector("[data-equals]");
     const deleteButton = document.querySelector("[data-delete]");
     const allClearButton = document.querySelector("[data-all-clear]");
     const previousOperandTextElement = document.querySelector("[data-previous-operand]");
     const currentOperandTextElement = document.querySelector("[data-current-operand]");

    const calculator = new Calculator(previousOperandTextElement, currentOperandTextElement);

numberButtons?.forEach((button: Element) => {
    button.addEventListener('click', () => {
        calculator.appendNumber((button as HTMLElement).innerText);
        calculator.updateDisplay();
    })
});

operationButtons?.forEach((button: Element) => {
    button.addEventListener('click', () => {
        calculator.chooseoperation((button as HTMLElement).innerText);
        calculator.updateDisplay();
    })
});

equalsButton?.addEventListener('click', (button) => {
    calculator.compute();
    calculator.updateDisplay();
});

allClearButton?.addEventListener('click', (button) => {
    calculator.clear();
    calculator.updateDisplay();
});

deleteButton?.addEventListener('click', (button) => {
    calculator.delete();
    calculator.updateDisplay();
});
}


init();
