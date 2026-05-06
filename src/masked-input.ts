import {
    type Component,
    CURSOR_MARKER,
    type Focusable,
    Key,
    matchesKey,
    truncateToWidth
} from '@mariozechner/pi-tui';

export class MaskedInput implements Component, Focusable {
    focused: boolean = false;
    private value: string = '';
    private cachedWidth?: number;
    private cachedLines?: string[];
    private label: string;

    public onSubmit?: (value: string) => void;
    public onCancel?: () => void;

    constructor(label: string) {
        this.label = label;
    }

    getValue(): string {
        return this.value;
    }

    handleInput(data: string): void {
        if (matchesKey(data, Key.enter)) {
            this.onSubmit?.(this.value);

            return;
        }
        if (matchesKey(data, Key.escape)) {
            this.onCancel?.();

            return;
        }
        if (matchesKey(data, Key.backspace)) {
            this.value = this.value.slice(0, -1);
            this.invalidate();

            return;
        }
        if (data.length === 1 && data.charCodeAt(0) >= 32) {
            this.value += data;
            this.invalidate();
        }
    }

    render(width: number): string[] {
        if (this.cachedLines && this.cachedWidth === width) {
            return this.cachedLines;
        }

        const masked = '●'.repeat(this.value.length);
        const cursor = this.focused ? `${CURSOR_MARKER}\x1b[7m \x1b[27m` : ' ';

        this.cachedLines = [truncateToWidth(`  ${this.label}  ${masked}${cursor}`, width)];
        this.cachedWidth = width;

        return this.cachedLines;
    }

    invalidate(): void {
        this.cachedWidth = undefined;
        this.cachedLines = undefined;
    }
}
