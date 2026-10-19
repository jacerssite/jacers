export function createMenuButton(text: string, action: () => void) {
    const button = document.createElement("button");
    button.className = "menu-button";
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
}

export function createTextButton(text: string, action: () => void) {
    const button = document.createElement("button");
    button.className = "text-button";
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
}

