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

export function createPasswordField(input: HTMLInputElement) {
    const wrapper = document.createElement("span");
    wrapper.className = "password-input-wrap";
    const toggle = document.createElement("button");
    toggle.className = "password-visibility-toggle";
    toggle.type = "button";
    toggle.textContent = "Show";
    toggle.setAttribute("aria-label", "Show password");
    toggle.setAttribute("aria-pressed", "false");
    toggle.addEventListener("click", () => {
        const visible = input.type === "text";
        input.type = visible ? "password" : "text";
        toggle.textContent = visible ? "Show" : "Hide";
        toggle.setAttribute("aria-label", visible ? "Show password" : "Hide password");
        toggle.setAttribute("aria-pressed", String(!visible));
        input.focus({ preventScroll: true });
    });
    wrapper.append(input, toggle);
    return wrapper;
}

