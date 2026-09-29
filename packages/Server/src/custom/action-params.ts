/**
 * @fileoverview Reading Action parameters the way a SCHEDULER hands them over.
 *
 * `spawn-renewals.action.ts` learned these the hard way and they are lifted here so the Bill.com
 * adapters use the same rules rather than a second copy that drifts:
 *
 *   · A ScheduledJob stores every parameter as TEXT. `false` arrives as the string "false", which is
 *     truthy — read loosely, a job configured for preview bills real customers on its first run.
 *   · An unset parameter arrives as an empty string, not as an absent row. Blank is ABSENT, otherwise
 *     clearing a value in the job editor makes a job that fails every night instead of taking the
 *     default.
 *   · A value that is present but unreadable is REFUSED, never replaced with the default. A dropped
 *     `MaxCount` is not a smaller cap, it is no cap.
 *
 * @module @mj-biz-apps/orders-server
 */
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';

export function param(params: RunActionParams, name: string): unknown {
    return params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value;
}

/** Whether the caller actually gave us this parameter. Blank is absent. */
export function supplied(params: RunActionParams, name: string): boolean {
    const raw = param(params, name);
    return raw != null && String(raw).trim().length > 0;
}

export function strParam(params: RunActionParams, name: string): string | null {
    const raw = param(params, name);
    if (raw == null) return null;
    const value = String(raw).trim();
    return value.length ? value : null;
}

/** `null` = absent; `NaN` = present but unreadable, so the caller refuses it. */
export function numParam(params: RunActionParams, name: string): number | null {
    if (!supplied(params, name)) return null;
    return Number(param(params, name));
}

/** `null` = absent or unreadable — check `supplied()` to tell them apart. */
export function boolParam(params: RunActionParams, name: string): boolean | null {
    const raw = param(params, name);
    if (raw == null || raw === '') return null;
    if (typeof raw === 'boolean') return raw;
    const value = String(raw).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(value)) return true;
    if (['false', '0', 'no', 'n'].includes(value)) return false;
    return null;
}

/** A comma-separated (or JSON array) list of strings. `null` = absent. */
export function listParam(params: RunActionParams, name: string): string[] | null {
    const raw = param(params, name);
    if (raw == null) return null;
    if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
    const text = String(raw).trim();
    if (!text) return null;
    if (text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text) as unknown;
            return Array.isArray(parsed) ? parsed.map(String).map((s) => s.trim()).filter(Boolean) : null;
        } catch {
            return null;
        }
    }
    return text.split(',').map((s) => s.trim()).filter(Boolean);
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Write (or overwrite) an Output param. Never write an output under an INPUT's name — it destroys the record of what the job was called with. */
export function setOutput(params: RunActionParams, name: string, value: unknown): void {
    const existing = params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase());
    if (existing) {
        existing.Value = value;
        existing.Type = 'Output';
        return;
    }
    params.Params = params.Params ?? [];
    params.Params.push({ Name: name, Value: value, Type: 'Output' } as ActionParam);
}
