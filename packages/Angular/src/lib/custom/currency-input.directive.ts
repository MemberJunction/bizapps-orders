/**
 * `<input mjoCurrency [(ngModel)]="amount">` — a money field that reads as money.
 *
 * WHY A DIRECTIVE. A bare `type="number"` shows `12500` where every other amount on the page
 * says `$12,500.00`, and it rejects a typed `$` or `,`. This accessor shows the amount formatted
 * (`FormatMoney`) while the field is idle, switches to the plain number on focus so the person
 * edits digits, parses whatever they type (`$`, commas and spaces ignored) and writes the number
 * to the model on every keystroke, then formats again on blur. Writing on input, not blur, is
 * deliberate: the widget's own `(blur)` save handlers read the model, and this keeps the model
 * ahead of them whichever listener Angular fires first.
 *
 * CONNECTS TO: ../panels/money-format.ts (FormatMoney — the one way money is written in this app)
 */
import { Directive, ElementRef, HostListener, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { FormatMoney } from '../panels/money-format';

/**
 * `"$1,250.50"` → `1250.5`; `"(1,250)"` → `-1250`; `""` → `null`; `"abc"` → `null`. Exported for the
 * unit test.
 *
 * Strict on purpose: only a currency sign, thousands commas in groups of three, one decimal point and
 * a leading minus or accounting parentheses are read. Anything else is `null`, not a guess: an earlier
 * version dropped every character it did not know, so `12k` saved as $12 and `1.250,00` as $1.25
 * (PR #1052 review). A `null` reaches the save handlers as "no change" and the old amount stays.
 */
export function ParseCurrencyInput(text: string): number | null {
    let s = String(text ?? '').trim();
    if (s === '') return null;
    let negative = false;
    if (s.startsWith('(') && s.endsWith(')')) {
        negative = true;
        s = s.slice(1, -1).trim();
    }
    if (s.startsWith('$')) s = s.slice(1).trim();
    if (s.startsWith('-')) {
        negative = !negative;
        s = s.slice(1).trim();
    }
    if (s.startsWith('$')) s = s.slice(1).trim();
    // Digits with optional comma grouping, an optional fraction (a trailing "." is someone mid-typing).
    if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d*)?$/.test(s) && !/^\.\d+$/.test(s)) return null;
    const n = Number(s.replace(/,/g, ''));
    if (!Number.isFinite(n)) return null;
    return negative ? -n : n;
}

@Directive({
    selector: 'input[mjoCurrency]',
    standalone: false,
    host: { inputmode: 'decimal', autocomplete: 'off' },
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MJOCurrencyInputDirective), multi: true }],
})
export class MJOCurrencyInputDirective implements ControlValueAccessor {
    private readonly el = inject(ElementRef<HTMLInputElement>);
    private value: number | null = null;
    private focused = false;
    private onChange: (value: number | null) => void = () => undefined;
    private onTouched: () => void = () => undefined;

    public writeValue(value: unknown): void {
        this.value = value == null || value === '' ? null : Number(value);
        if (this.value != null && !Number.isFinite(this.value)) this.value = null;
        this.render();
    }

    public registerOnChange(fn: (value: number | null) => void): void {
        this.onChange = fn;
    }

    public registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    public setDisabledState(disabled: boolean): void {
        this.el.nativeElement.disabled = disabled;
    }

    @HostListener('focus')
    public OnFocus(): void {
        this.focused = true;
        this.render();
        const input = this.el.nativeElement;
        setTimeout(() => input.select(), 0);
    }

    @HostListener('input')
    public OnInput(): void {
        const parsed = ParseCurrencyInput(this.el.nativeElement.value);
        this.value = parsed;
        this.onChange(parsed);
    }

    @HostListener('blur')
    public OnBlur(): void {
        this.focused = false;
        this.render();
        this.onTouched();
    }

    /** Idle: `$12,500.00`. Focused: `12500` (or `12500.5`), the digits the person edits. */
    private render(): void {
        const input = this.el.nativeElement;
        if (this.value == null) {
            input.value = '';
            return;
        }
        input.value = this.focused ? String(this.value) : FormatMoney(this.value);
    }
}
