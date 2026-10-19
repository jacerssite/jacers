import type { RouletteTier } from "./types";

const chanceLabels = {
    claims: "Asteroids",
    specialClaims: "Special asteroids",
    color: "Ship color",
    trail: "Trail",
    avatar: "Avatar",
} as const;

export function createRouletteFields(initial: RouletteTier[]) {
    const element = document.createElement("div");
    element.className = "roulette-tier-list";

    function draw(tiers: RouletteTier[]) {
        element.replaceChildren();
        tiers.forEach((tier) => {
            const section = document.createElement("fieldset");
            section.className = "roulette-tier-card";
            section.dataset.buyIn = String(tier.buyIn);
            const legend = document.createElement("legend");
            legend.textContent = `${tier.buyIn} special asteroids`;
            section.append(legend);
            const addFields = (title: string, fields: { label: string; key: string; value: number; min: number; max: number }[]) => {
                const heading = document.createElement("p");
                heading.className = "roulette-tier-heading";
                heading.textContent = title;
                const grid = document.createElement("div");
                grid.className = "roulette-tier-grid";
                fields.forEach(({ label: text, key, value, min, max }) => {
                    const label = document.createElement("label");
                    label.append(document.createTextNode(text));
                    const input = document.createElement("input");
                    input.type = "number";
                    input.min = String(min);
                    input.max = String(max);
                    input.step = "1";
                    input.required = true;
                    input.value = String(value);
                    input.dataset.rouletteField = key;
                    input.setAttribute("aria-label", `${tier.buyIn} tier ${text}`);
                    label.append(input);
                    grid.append(label);
                });
                section.append(heading, grid);
            };
            addFields("Prize chances — total must be 100%", (Object.keys(chanceLabels) as (keyof typeof chanceLabels)[]).map((key) => ({
                label: `${chanceLabels[key]} %`, key: `chance.${key}`, value: tier.chances[key], min: 0, max: 100,
            })));
            addFields("Asteroid rewards", [
                { label: "Normal minimum", key: "reward.claims.min", value: tier.rewards.claims[0], min: 1, max: 1000000 },
                { label: "Normal maximum", key: "reward.claims.max", value: tier.rewards.claims[1], min: 1, max: 1000000 },
                { label: "Special minimum", key: "reward.specialClaims.min", value: tier.rewards.specialClaims[0], min: 1, max: 1000000 },
                { label: "Special maximum", key: "reward.specialClaims.max", value: tier.rewards.specialClaims[1], min: 1, max: 1000000 },
            ]);
            element.append(section);
        });
    }

    function read(): RouletteTier[] {
        return Array.from(element.querySelectorAll<HTMLFieldSetElement>(".roulette-tier-card"), (section) => {
            const value = (key: string) => Number(section.querySelector<HTMLInputElement>(`[data-roulette-field="${key}"]`)!.value);
            return {
                buyIn: Number(section.dataset.buyIn) as RouletteTier["buyIn"],
                chances: {
                    claims: value("chance.claims"), specialClaims: value("chance.specialClaims"), color: value("chance.color"),
                    trail: value("chance.trail"), avatar: value("chance.avatar"),
                },
                rewards: {
                    claims: [value("reward.claims.min"), value("reward.claims.max")],
                    specialClaims: [value("reward.specialClaims.min"), value("reward.specialClaims.max")],
                },
            };
        });
    }

    draw(initial);
    return { element, draw, read };
}
