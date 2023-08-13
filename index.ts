
import { Calculator} from './Calculator';



function init(): void{
     const numberButtons = document.querySelectorAll("[data-number]");
     const operationButtons = document.querySelectorAll("[data-operation]");
     const equalsButton = document.querySelector("[data-equals]");
     const deleteButton = document.querySelector("[data-delete]");
     const allClearButton = document.querySelector("[data-clear]");
     const previousCalculationTextElement = document.querySelector("[data-previous-calculation]");
     const currentCalculationTextElement = document.querySelector("[data-current-calculation]");

    const calculator = new Calculator(previousCalculationTextElement, currentCalculationTextElement);

numberButtons?.forEach((button: Element) => {
    button.addEventListener('click', () => {
        calculator.appendNumber((button as HTMLElement).innerText);
        calculator.updateCalculatorDisplay();
    })
});

operationButtons?.forEach((button: Element) => {
    button.addEventListener('click', () => {
        calculator.chooseCalculationType((button as HTMLElement).innerText);
        calculator.updateCalculatorDisplay();
    })
});

equalsButton?.addEventListener('click', (button) => {
    calculator.calculate();
    calculator.updateCalculatorDisplay();
});

allClearButton?.addEventListener('click', (button) => {
    calculator.clear();
    calculator.updateCalculatorDisplay();
});

deleteButton?.addEventListener('click', (button) => {
    calculator.delete();
    calculator.updateCalculatorDisplay();
});
}


init();
