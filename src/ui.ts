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

export type ActionDialogOptions = {
    title: string;
    description: string;
    confirmLabel: string;
    danger?: boolean;
    input?: { label: string; placeholder?: string; value?: string; requiredValue?: string; optional?: boolean };
};

/** A non-blocking, in-game replacement for browser confirm and prompt dialogs. */
export function showActionDialog(options: ActionDialogOptions): Promise<{ confirmed: boolean; value: string }> {
    return new Promise((resolve) => {
        document.querySelector<HTMLElement>(".action-dialog-overlay")?.remove();
        const overlay = document.createElement("div");
        overlay.className = "action-dialog-overlay";
        overlay.setAttribute("role", "presentation");
        const dialog = document.createElement("section");
        dialog.className = "action-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        const heading = document.createElement("h2"); heading.textContent = options.title;
        const description = document.createElement("p"); description.textContent = options.description;
        const status = document.createElement("small"); status.className = "action-dialog-status"; status.setAttribute("role", "status");
        let input: HTMLInputElement | undefined;
        if (options.input) {
            const field = document.createElement("label"); field.className = "action-dialog-field";
            const label = document.createElement("span"); label.textContent = options.input.label;
            input = document.createElement("input"); input.type = "text"; input.autocomplete = "off"; input.placeholder = options.input.placeholder ?? ""; input.value = options.input.value ?? "";
            field.append(label, input); dialog.append(field);
        }
        const close = (confirmed: boolean) => {
            const value = input?.value.trim() ?? "";
            overlay.remove();
            resolve({ confirmed, value });
        };
        const actions = document.createElement("div"); actions.className = "action-dialog-actions";
        const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "action-dialog-cancel"; cancel.textContent = "Cancel"; cancel.addEventListener("click", () => close(false));
        const confirm = document.createElement("button"); confirm.type = "button"; confirm.className = `action-dialog-confirm${options.danger ? " danger" : ""}`; confirm.textContent = options.confirmLabel;
        confirm.addEventListener("click", () => {
            if (options.input?.requiredValue && input?.value.trim() !== options.input.requiredValue) {
                status.textContent = `Type ${options.input.requiredValue} exactly to continue.`;
                input?.focus();
                return;
            }
            close(true);
        });
        dialog.prepend(heading, description);
        dialog.append(status, actions);
        actions.append(cancel, confirm);
        overlay.addEventListener("click", (event) => { if (event.target === overlay) close(false); });
        dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") close(false); });
        overlay.append(dialog); document.body.append(overlay);
        (input ?? confirm).focus();
    });
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

