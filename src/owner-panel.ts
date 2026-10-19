export interface ControlSection {
    id: string;
    title: string;
    description: string;
    group: string;
    panel: HTMLElement;
    onOpen?: () => void;
}

// Keep navigation separate from the settings themselves so sections are
// explicitly assigned, instead of guessing from the text in each control.
export function createControlNavigation(sections: ControlSection[], onSelect: (section: ControlSection) => void) {
    const nav = document.createElement("nav");
    nav.className = "tester-sidebar";
    nav.setAttribute("aria-label", "Control center sections");
    const buttons = new Map<string, HTMLButtonElement>();
    let group = "";
    sections.forEach((section) => {
        if (section.group !== group) {
            group = section.group;
            const heading = document.createElement("p");
            heading.className = "tester-sidebar-heading";
            heading.textContent = group;
            nav.append(heading);
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tester-section-button";
        button.textContent = section.title;
        button.dataset.section = section.id;
        button.addEventListener("click", () => onSelect(section));
        buttons.set(section.id, button);
        nav.append(button);
    });
    return {
        nav,
        select(id: string) {
            buttons.forEach((button, candidate) => {
                const selected = candidate === id;
                button.classList.toggle("selected", selected);
                if (selected) button.setAttribute("aria-current", "page");
                else button.removeAttribute("aria-current");
            });
        },
    };
}
