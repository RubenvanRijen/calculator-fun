export class Calculator {

    private currentOperandTextElement;
    private previousOperandTextElement;
    private currentOperand: string;
    private previousOperand: string;
    private operation: string|null;

    constructor(previousOperandTextElement, currentOperandTextElement) {
        this.currentOperandTextElement = currentOperandTextElement;
        this.previousOperandTextElement = previousOperandTextElement;
        this.clear();
    }

    public clear(): void {
        this.currentOperand = '';
        this.previousOperand = '';
        this.operation = null;
    }

    public delete(): void {
        this.currentOperand = this.currentOperand.toString().slice(0, -1);
    }

    public appendNumber(number): void {
        if (number === '.' && this.currentOperand.includes('.')) return;
        this.currentOperand = this.currentOperand.toString() + number.toString();
    }


    public chooseoperation(operation): void {
        if (this.currentOperand === '') return;
        if (this.previousOperand !== '') {
            this.compute()
        }
        this.operation = operation;
        this.previousOperand = this.currentOperand;
        this.currentOperand = '';
    }

    public  compute(): void {
        let computation;
        const prev = parseFloat(this.previousOperand);
        const current = parseFloat(this.currentOperand);
        if (isNaN(prev) || isNaN(current)) return;

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
    }

    public styleDisplayNumber(number):string {
        const stringNumber = number.toString();
        const integerDigits = parseFloat(stringNumber.split('.')[0]);
        const decimalDigits = (stringNumber.split('.')[1]);
        let integerDisplay:string = ''
        if (isNaN(integerDigits)) {
            integerDisplay = '';
        } else {
            integerDisplay = integerDigits.toLocaleString('en', {
                maximumFractionDigits: 0
            });
        }
        if (decimalDigits !== null && decimalDigits !== undefined) {
            return `${integerDisplay}.${decimalDigits}`;
        } else {
            return integerDisplay;
        }

    }

    public updateDisplay(): void {
        this.currentOperandTextElement.innerText = this.styleDisplayNumber(this.currentOperand);
        if (this.operation !== undefined && this.operation !== null) {
            this.previousOperandTextElement.innerText = `${this.styleDisplayNumber(this.previousOperand)} ${this.operation}`
        } else {
            this.previousOperandTextElement.innerText = '';
        }

    }
}