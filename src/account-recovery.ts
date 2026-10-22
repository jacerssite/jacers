import { apiRequest } from "./api";
import { levels } from "./levels";
import { createMenuButton, createPasswordField, createTextButton } from "./ui";

export function createAccountRecovery(showAccount: (message?: string) => void) {
    function showRecoveryCodeOnce(code: string, onContinue: () => void) {
        const screen = document.createElement("main");
        screen.className = "menu-screen recovery-code-screen";
        screen.innerHTML = `<p class="eyebrow">ACCOUNT SECURITY / SAVE THIS CODE</p><h1>Recovery <em>code</em></h1><p class="menu-copy">This is the only way back into your account if you forget your password. It cannot be shown again.</p>`;
        const codeDisplay = document.createElement("strong");
        codeDisplay.className = "recovery-code-display";
        codeDisplay.textContent = code;
        const actions = document.createElement("div");
        actions.className = "secondary-actions";
        const status = document.createElement("small");
        status.setAttribute("role", "status");
        const copy = createTextButton("Copy recovery code", async () => {
            try {
                await navigator.clipboard.writeText(code);
                status.textContent = "Recovery code copied.";
            } catch {
                status.textContent = "Copy was unavailable. Select the code and copy it manually.";
            }
        });
        const download = createTextButton("Download as text file", () => {
            const file = new Blob([`Jacer recovery code: ${code}\nKeep this code private and do not share it.\n`], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(file);
            const link = document.createElement("a");
            link.href = url;
            link.download = "jacer-recovery-code.txt";
            link.click();
            URL.revokeObjectURL(url);
            status.textContent = "Recovery code downloaded.";
        });
        actions.append(copy, download);
        const savedLabel = document.createElement("label");
        savedLabel.className = "recovery-code-confirm";
        const saved = document.createElement("input");
        saved.type = "checkbox";
        savedLabel.append(saved, document.createTextNode(" I saved my recovery code."));
        const continueButton = createMenuButton("Continue", onContinue);
        continueButton.disabled = true;
        saved.addEventListener("change", () => { continueButton.disabled = !saved.checked; });
        screen.append(codeDisplay, actions, status, savedLabel, continueButton);
        document.body.replaceChildren(screen);
    }

    function showForgotPassword() {
        const screen = document.createElement("main");
        screen.className = "menu-screen account-screen recovery-screen";
        screen.innerHTML = `<p class="eyebrow">ONLINE ACCOUNT / RECOVERY</p><h1>Reset your <em>password</em></h1><p class="menu-copy">Accounts made before recovery codes existed can use their last level played until they make a recovery code.</p>`;
        const form = document.createElement("form");
        form.className = "account-form";
        const createField = (labelText: string, type: string, autocomplete: HTMLInputElement["autocomplete"], minLength?: number, maxLength?: number) => {
            const label = document.createElement("label");
            label.textContent = labelText;
            const input = document.createElement("input");
            input.type = type;
            input.autocomplete = autocomplete;
            input.required = true;
            if (minLength !== undefined) input.minLength = minLength;
            if (maxLength !== undefined) input.maxLength = maxLength;
            label.append(type === "password" ? createPasswordField(input) : input);
            form.append(label);
            return input;
        };
        const username = createField("Username", "text", "username", 3, 20);
        username.pattern = "[A-Za-z0-9_]{3,20}";
        const recoveryCode = createField("Recovery code", "text", "off", 16, 19);
        recoveryCode.autocapitalize = "characters";
        const lastLevelLabel = document.createElement("label");
        lastLevelLabel.textContent = "Pick the last level you played while signed in";
        const lastLevel = document.createElement("select");
        lastLevel.required = true;
        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "Choose a level";
        lastLevel.append(emptyOption);
        levels.filter((level) => !level.localOnly).forEach((level) => {
            const option = document.createElement("option");
            option.value = level.name;
            option.textContent = level.name;
            lastLevel.append(option);
        });
        lastLevelLabel.append(lastLevel);
        lastLevelLabel.hidden = true;
        const toggleMode = createTextButton("I don't have a recovery code", () => {
            const useFallback = !lastLevelLabel.hidden;
            lastLevelLabel.hidden = useFallback;
            recoveryCode.closest("label")!.hidden = !useFallback;
            recoveryCode.required = useFallback;
            lastLevel.required = !useFallback;
            toggleMode.textContent = useFallback ? "I don't have a recovery code" : "Use a recovery code";
        });
        const newPassword = createField("New password", "password", "new-password", 10, 128);
        const repeatPassword = createField("Repeat new password", "password", "new-password", 10, 128);
        const status = document.createElement("small");
        status.className = "online-service-status";
        status.setAttribute("role", "status");
        const submit = document.createElement("button");
        submit.className = "menu-button";
        submit.type = "submit";
        submit.textContent = "Reset password";
        form.append(toggleMode, lastLevelLabel, submit, status);
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (newPassword.value !== repeatPassword.value) {
                status.textContent = "The new passwords do not match.";
                return;
            }
            submit.disabled = true;
            status.textContent = "Checking recovery details...";
            try {
                const result = await apiRequest<{ recoveryCode: string }>("/auth/recover", {
                    method: "POST",
                    body: JSON.stringify({
                        username: username.value,
                        recoveryCode: lastLevelLabel.hidden ? recoveryCode.value : undefined,
                        lastLevel: lastLevelLabel.hidden ? undefined : lastLevel.value,
                        newPassword: newPassword.value,
                    }),
                });
                showRecoveryCodeOnce(result.recoveryCode, () => showAccount("Password reset. Sign in with your new password."));
            } catch (error) {
                status.textContent = error instanceof Error ? error.message : "Could not reset the password.";
                submit.disabled = false;
            } finally {
                newPassword.value = "";
                repeatPassword.value = "";
                recoveryCode.value = "";
            }
        });
        screen.append(form, createTextButton("Back to sign in", () => showAccount()));
        document.body.replaceChildren(screen);
    }


    return { showRecoveryCodeOnce, showForgotPassword };
}
