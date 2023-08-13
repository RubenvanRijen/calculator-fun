export class Calculator {

    private currentCalculationTextElement;
    private previousCalculationTextElement;
    private currentCalculation: string;
    private previousCalculation: string;
    private calculation: string|null;

    constructor(previousCalculationTextElement, currentCalculationTextElement) {
        this.currentCalculationTextElement = currentCalculationTextElement;
        this.previousCalculationTextElement = previousCalculationTextElement;
        this.clear();
    }

    public clear(): void {
        this.currentCalculation = '';
        this.previousCalculation = '';
        this.calculation = null;
    }

    public delete(): void {
        this.currentCalculation = this.currentCalculation.toString().slice(0, -1);
    }

    public appendNumber(number): void {
        if (number === '.' && this.currentCalculation.includes('.')) return;
        this.currentCalculation = this.currentCalculation.toString() + number.toString();
    }


    public chooseCalculationType(operation): void {
        if (this.currentCalculation === '') return;
        if (this.previousCalculation !== '') {
            this.calculate()
        }
        this.calculation = operation;
        this.previousCalculation = this.currentCalculation;
        this.currentCalculation = '';
    }

    public calculate(): void {
        let computation: number;
        const prev = parseFloat(this.previousCalculation);
        const current = parseFloat(this.currentCalculation);
        if (isNaN(prev) || isNaN(current)) return;

        switch (this.calculation) {
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

        this.currentCalculation = computation.toString();
        this.calculation = null;
        this.previousCalculation = '';
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

    public updateCalculatorDisplay(): void {
        this.currentCalculationTextElement.innerText = this.styleDisplayNumber(this.currentCalculation);
        if (this.calculation !== undefined && this.calculation !== null) {
            this.previousCalculationTextElement.innerText = `${this.styleDisplayNumber(this.previousCalculation)} ${this.calculation}`
        } else {
            this.previousCalculationTextElement.innerText = '';
        }

    }
}