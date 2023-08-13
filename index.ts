
import { Calculator} from './Calculator';

export class Index{

private numberButtons:NodeList;
private operationButtons:NodeList;
private equalsButton:Element;
private deleteButton:Element;
private allClearButton :Element;
private previousOperandTextElement:Element;
private currentOperandTextElement:Element;

constructor(){
    this.numberButtons = document.querySelectorAll("[data-number]");
    this.operationButtons = document.querySelectorAll("[data-operation]");
    this.equalsButton = document.querySelector("[data-equals]");
    this.deleteButton = document.querySelector("[data-delete]");
    this.allClearButton = document.querySelector("[data-all-clear]");
    this.previousOperandTextElement = document.querySelector("[data-previous-operand]");
    this.currentOperandTextElement = document.querySelector("[data-current-operand]");
    this.init();
}

private init(): void{
    const calculator = new Calculator(this.previousOperandTextElement, this.currentOperandTextElement);

this.numberButtons.forEach((button: Element) => {
    button.addEventListener('click', () => {
        calculator.appendNumber((button as HTMLElement).innerText);
        calculator.updateDisplay();
    })
});

this.operationButtons.forEach((button: Element) => {
    button.addEventListener('click', () => {
        calculator.chooseoperation((button as HTMLElement).innerText);
        calculator.updateDisplay();
    })
});

this.equalsButton?.addEventListener('click', (button) => {
    calculator.compute();
    calculator.updateDisplay();
});

this.allClearButton?.addEventListener('click', (button) => {
    calculator.clear();
    calculator.updateDisplay();
});

this.deleteButton?.addEventListener('click', (button) => {
    calculator.delete();
    calculator.updateDisplay();
});
}



}