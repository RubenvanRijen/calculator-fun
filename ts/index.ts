import {Calculator, isOperation} from "./calculator.js";

export interface SetupOptions {
    onError?: (message: string) => void;
}

export function setupCalculator(
    root: Document | HTMLElement,
    options: SetupOptions = {}
): Calculator {
    const onError = options.onError ?? ((message: string) => globalThis.alert(message));

    const numberButtons = root.querySelectorAll<HTMLElement>("[data-number]");
    const operationButtons = root.querySelectorAll<HTMLElement>("[data-operation]");
    const equalsButton = root.querySelector<HTMLElement>("[data-equals]");
    const deleteButton = root.querySelector<HTMLElement>("[data-delete]");
    const allClearButton = root.querySelector<HTMLElement>("[data-all-clear]");
    const previousOperandTextElement = root.querySelector<HTMLElement>(
        "[data-previous-operand]"
    );
    const currentOperandTextElement = root.querySelector<HTMLElement>(
        "[data-current-operand]"
    );

    if (!previousOperandTextElement || !currentOperandTextElement) {
        throw new Error(
            "Calculator markup is missing [data-previous-operand] or [data-current-operand]."
        );
    }

    const calculator = new Calculator();

    const updateDisplay = (): void => {
        currentOperandTextElement.textContent = calculator.currentDisplay;
        previousOperandTextElement.textContent = calculator.previousDisplay;
        if (calculator.error !== null) onError(calculator.error);
    };

    numberButtons.forEach((button) => {
        button.addEventListener("click", () => {
            calculator.appendNumber(button.textContent ?? "");
            updateDisplay();
        });
    });

    operationButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const operation = button.textContent ?? "";
            if (!isOperation(operation)) return;
            calculator.chooseOperation(operation);
            updateDisplay();
        });
    });

    equalsButton?.addEventListener("click", () => {
        calculator.compute();
        updateDisplay();
    });

    allClearButton?.addEventListener("click", () => {
        calculator.clear();
        updateDisplay();
    });

    deleteButton?.addEventListener("click", () => {
        calculator.delete();
        updateDisplay();
    });

    updateDisplay();
    return calculator;
}

if (typeof document !== "undefined" && document.querySelector(".calculator-grid")) {
    setupCalculator(document);
}
